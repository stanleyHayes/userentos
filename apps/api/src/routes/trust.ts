/**
 * Contact protection (TRUST-2): appeals from authors, and the admin review
 * queue and health figures (docs/trust/RUNBOOK.md).
 *
 * Reviewers see masked excerpts only — digits, emails, links and handles are
 * already gone from the record — plus the reason codes and scores. A reviewer
 * label feeds the next training set (docs/trust/LABELING_GUIDE.md).
 */
import { Router } from 'express'
import { z } from 'zod'
import type { Types } from 'mongoose'
import { authenticate, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { writeLimiter } from '../middleware/rateLimit.js'
import { TrustDecision, TRUST_CHANNELS, TRUST_REVIEW_STATUSES } from '../models/TrustDecision.js'
import { Message } from '../models/Conversation.js'
import { User } from '../models/User.js'
import { INTENT_LABELS } from '../services/trust/model.js'
import { trustMode, modelEnforcePercent, VERSIONS } from '../services/trust/screen.js'
import { notify } from '../services/notify.js'
import { recordAudit } from '../utils/audit.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'

const router = Router()
const admin = [authenticate, requireRole('admin', 'super_admin')]

/** "This was a mistake": the author asks a person to look at a stopped message. */
router.post('/decisions/:id/appeal', authenticate, writeLimiter, asyncHandler(async (req, res) => {
  const parsed = z.object({ note: z.string().trim().max(500).optional() }).safeParse(req.body ?? {})
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const decision = await TrustDecision.findOne({ _id: param(req.params.id), authorId: req.user!.userId, decision: 'BLOCK', enforced: true })
  if (!decision) { error(res, 'That decision was not found', 404); return }
  if (decision.review.status !== 'pending') { error(res, decision.review.status === 'appealed' ? 'You have already asked for a review of this message.' : 'This message has already been reviewed.', 409); return }
  decision.review.status = 'appealed'
  decision.review.appealNote = parsed.data.note
  decision.review.appealedAt = new Date()
  await decision.save()
  success(res, { status: 'appealed' }, 'Thanks — a person will review it. If it was stopped by mistake, you will be able to send the same text.')
}))

const listQuery = z.object({
  status: z.enum(TRUST_REVIEW_STATUSES).optional(),
  decision: z.enum(['ALLOW', 'BLOCK']).optional(),
  mode: z.enum(['enforce', 'shadow']).optional(),
  channel: z.enum(TRUST_CHANNELS).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
})

/** The review queue: appeals first by default, newest first. */
router.get('/admin/decisions', ...admin, asyncHandler(async (req, res) => {
  const parsed = listQuery.safeParse(req.query)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const { status, decision, mode, channel, page } = parsed.data
  const filter: Record<string, unknown> = {}
  if (status) filter['review.status'] = status
  if (decision) filter.decision = decision
  if (mode) filter.mode = mode
  if (channel) filter.channel = channel
  const pageSize = 50
  const [items, total] = await Promise.all([
    TrustDecision.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).select('-textDigest').lean(),
    TrustDecision.countDocuments(filter),
  ])
  const authorIds = [...new Set(items.map((d) => d.authorId))]
  const authors = await User.find({ _id: { $in: authorIds } }).select('firstName lastName roles suspendedAt').lean()
  const byId = new Map(authors.map((u) => [(u._id as Types.ObjectId).toString(), u]))
  success(res, {
    items: items.map((d) => {
      const author = byId.get(d.authorId)
      return {
        ...d,
        id: (d._id as Types.ObjectId).toString(),
        author: author ? { id: d.authorId, name: `${author.firstName} ${author.lastName}`.trim(), roles: author.roles, suspended: Boolean(author.suspendedAt) } : { id: d.authorId, name: 'Closed account', roles: [], suspended: false },
      }
    }),
    total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
}))

const reviewSchema = z.object({
  outcome: z.enum(['upheld', 'overturned']),
  label: z.enum(INTENT_LABELS).optional(),
  note: z.string().trim().max(1000).optional(),
})

/** Record a reviewer's verdict. Overturning lets the same text through and removes the strike. */
router.post('/admin/decisions/:id/review', ...admin, asyncHandler(async (req, res) => {
  const parsed = reviewSchema.safeParse(req.body ?? {})
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const decision = await TrustDecision.findById(param(req.params.id))
  if (!decision) { error(res, 'Decision not found', 404); return }
  const wasAppealed = decision.review.status === 'appealed'
  decision.review.status = parsed.data.outcome
  decision.review.label = parsed.data.label
  decision.review.note = parsed.data.note
  decision.review.reviewedBy = req.user!.userId
  decision.review.reviewedAt = new Date()
  await decision.save()
  await recordAudit(req, `trust.decision_${parsed.data.outcome}`, 'TrustDecision', String(decision._id), { reasonCodes: decision.reasonCodes, label: parsed.data.label })

  if (wasAppealed && decision.enforced) {
    void notify({
      userId: decision.authorId,
      title: parsed.data.outcome === 'overturned' ? 'Your message can be sent' : 'We reviewed your message',
      message: parsed.data.outcome === 'overturned'
        ? 'A reviewer found your message was stopped by mistake. Send the same text again and it will go through.'
        : 'A reviewer agreed the message shared contact details or moved the deal off RentOS, so it stays unsent. Keep conversations and payments on RentOS.',
      actionUrl: decision.conversationId ? `/messages?conversationId=${decision.conversationId}` : '/messages',
      skipEmail: parsed.data.outcome === 'upheld',
    })
  }
  success(res, { ...decision.toObject(), id: String(decision._id), textDigest: undefined }, 'Review saved')
}))

/** Health at a glance: volumes, reasons, appeals, overturn rate, latency, configuration. */
router.get('/admin/stats', ...admin, asyncHandler(async (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 7))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const window = { createdAt: { $gte: since } }
  const [byOutcome, byReason, byChannel, reviewed, appealsOpen, latency, messagesSent] = await Promise.all([
    TrustDecision.aggregate([{ $match: window }, { $group: { _id: { decision: '$decision', enforced: '$enforced', mode: '$mode' }, count: { $sum: 1 } } }]),
    TrustDecision.aggregate([{ $match: { ...window, decision: 'BLOCK' } }, { $unwind: '$reasonCodes' }, { $group: { _id: '$reasonCodes', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    TrustDecision.aggregate([{ $match: { ...window, decision: 'BLOCK' } }, { $group: { _id: '$channel', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    TrustDecision.aggregate([{ $match: { ...window, 'review.status': { $in: ['upheld', 'overturned'] } } }, { $group: { _id: '$review.status', count: { $sum: 1 } } }]),
    TrustDecision.countDocuments({ 'review.status': 'appealed' }),
    TrustDecision.find(window).sort({ createdAt: -1 }).limit(2000).select('latencyMs degraded').lean(),
    Message.countDocuments(window),
  ])
  const count = (rows: { _id: unknown; count: number }[], match: (id: Record<string, unknown>) => boolean) => rows.filter((r) => match(r._id as Record<string, unknown>)).reduce((sum, r) => sum + r.count, 0)
  const enforcedBlocks = count(byOutcome, (id) => id.decision === 'BLOCK' && id.enforced === true)
  const shadowBlocks = count(byOutcome, (id) => id.decision === 'BLOCK' && id.enforced !== true)
  const nearMisses = count(byOutcome, (id) => id.decision === 'ALLOW')
  const upheld = reviewed.find((r) => r._id === 'upheld')?.count ?? 0
  const overturned = reviewed.find((r) => r._id === 'overturned')?.count ?? 0
  const latencies = latency.map((d) => d.latencyMs ?? 0).sort((a, b) => a - b)
  const pct = (p: number) => (latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))] : null)
  success(res, {
    days,
    config: { mode: trustMode(), modelEnforcePercent: modelEnforcePercent(), versions: VERSIONS },
    volume: {
      messagesSent,
      enforcedBlocks,
      shadowBlocks,
      nearMisses,
      // Share of chat sends stopped: blocks never become messages.
      blockRate: messagesSent + enforcedBlocks > 0 ? enforcedBlocks / (messagesSent + enforcedBlocks) : 0,
    },
    reasons: byReason.map((r) => ({ code: r._id, count: r.count })),
    channels: byChannel.map((r) => ({ channel: r._id, count: r.count })),
    reviews: { upheld, overturned, overturnRate: upheld + overturned > 0 ? overturned / (upheld + overturned) : null, appealsOpen },
    latencyMs: { p50: pct(0.5), p95: pct(0.95), p99: pct(0.99) },
    degraded: latency.filter((d) => d.degraded).length,
  })
}))

export default router

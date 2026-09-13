/**
 * Abuse reporting and the admin takedown queue (spec §6, §15).
 *
 * The reporting side is deliberately cheap to use — one POST, no ceremony —
 * because the alternative to an easy report button is a renter who just leaves.
 * The cost of that openness is report-bombing, which the velocity limit and the
 * one-open-report-per-target index in the model are there to absorb.
 */
import { Router } from 'express'
import { z } from 'zod'
import { authenticate, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { writeLimiter } from '../middleware/rateLimit.js'
import { ContentReport, REPORT_TARGET_TYPES, REPORT_REASONS } from '../models/ContentReport.js'
import { User } from '../models/User.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { suspendAccount } from '../services/accountSuspension.js'
import { recordAudit } from '../utils/audit.js'
import {
  checkReportVelocity,
  resolveReportTarget,
  removeReportedContent,
  canResolveReport,
  statusForAction,
  openReportCounts,
} from '../services/contentReports.js'

const router = Router()

const reportSchema = z.object({
  targetType: z.enum(REPORT_TARGET_TYPES),
  targetId: z.string().min(1).max(64),
  reason: z.enum(REPORT_REASONS),
  details: z.string().max(2000).optional(),
})

/** File a report. */
router.post('/', authenticate, writeLimiter, asyncHandler(async (req, res) => {
  const parsed = reportSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const now = new Date()
  const recent = await ContentReport
    .find({ reporterId: req.user!.userId, createdAt: { $gt: new Date(now.getTime() - 60 * 60 * 1000) } })
    .select('createdAt').lean()

  const velocity = checkReportVelocity(recent.map((r) => r.createdAt), now)
  if (!velocity.allowed) {
    if (velocity.retryAfterMinutes) res.setHeader('Retry-After', String(velocity.retryAfterMinutes * 60))
    error(res, velocity.reason ?? 'Too many reports.', 429)
    return
  }

  const target = await resolveReportTarget(parsed.data.targetType, parsed.data.targetId, req.user!.userId)
  if (!target.exists) { error(res, 'That item no longer exists.', 404); return }

  // Reporting your own listing is almost always a mis-click, and letting it
  // through would put noise in a queue a human has to read.
  if (target.ownerId && target.ownerId === req.user!.userId) {
    error(res, 'You cannot report your own content.', 422)
    return
  }

  try {
    const report = await ContentReport.create({
      reporterId: req.user!.userId,
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      targetLabel: target.label,
      targetOwnerId: target.ownerId,
      reason: parsed.data.reason,
      details: parsed.data.details,
      ipAddress: req.ip,
    })

    await recordAudit(req, 'report.filed', 'ContentReport', String(report._id), {
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      reason: parsed.data.reason,
    })

    success(res, { id: String(report._id), status: report.status }, 'Report received. Our team will review it.', 201)
  } catch (err) {
    // The partial unique index is what enforces one open report per target;
    // catching its duplicate-key error is cheaper and race-free compared with
    // checking first and then inserting.
    if ((err as { code?: number }).code === 11000) {
      error(res, 'You have already reported this — our team is looking at it.', 409)
      return
    }
    throw err
  }
}))

/** What the reporter can see: their own reports and whether they are resolved. */
router.get('/mine', authenticate, asyncHandler(async (req, res) => {
  const items = await ContentReport.find({ reporterId: req.user!.userId })
    .sort({ createdAt: -1 }).limit(100)
    // Never the action taken or the resolution note: that is the reported
    // party's business, and a reporter must not be able to probe it.
    .select('targetType targetId targetLabel reason status createdAt')
    .lean()

  success(res, { items: items.map((r) => ({ ...r, id: String(r._id) })), total: items.length })
}))

// ─── Admin queue ───

router.get('/admin/queue', authenticate, requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const filter: Record<string, unknown> = {}
  if (typeof req.query.status === 'string' && req.query.status) filter.status = req.query.status
  else filter.status = { $in: ['open', 'reviewing'] }
  if (typeof req.query.targetType === 'string' && req.query.targetType) filter.targetType = req.query.targetType
  if (typeof req.query.reason === 'string' && req.query.reason) filter.reason = req.query.reason

  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25))

  const [items, total] = await Promise.all([
    // Oldest first: the queue is a work list, and the oldest unanswered report
    // is the one that has been failing someone the longest.
    ContentReport.find(filter).sort({ createdAt: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    ContentReport.countDocuments(filter),
  ])

  // One batched lookup for reporter and owner names — a per-row lookup here is
  // the classic way a moderation queue gets slow enough to stop being used.
  const userIds = [...new Set(items.flatMap((r) => [r.reporterId, r.targetOwnerId]).filter(Boolean) as string[])]
  const users = await User.find({ _id: { $in: userIds } }).select('firstName lastName email suspendedAt suspensionReportId').lean()
  const byId = new Map(users.map((u) => [String(u._id), u]))

  const counts = await openReportCounts(items.map((r) => ({ targetType: r.targetType, targetId: r.targetId })))

  const statusCounts = await ContentReport.aggregate<{ _id: string; count: number }>([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ])

  success(res, {
    items: items.map((r) => {
      const reporter = byId.get(r.reporterId)
      const owner = r.targetOwnerId ? byId.get(r.targetOwnerId) : undefined
      return {
        ...r,
        id: String(r._id),
        reporterName: reporter ? `${reporter.firstName} ${reporter.lastName}`.trim() : 'Unknown',
        reporterEmail: reporter?.email,
        ownerName: owner ? `${owner.firstName} ${owner.lastName}`.trim() : undefined,
        ownerEmail: owner?.email,
        canRestoreAccount: !!owner?.suspendedAt && owner.suspensionReportId === String(r._id),
        /** How many open reports this same item has — the repeat-offender signal. */
        openReportsForTarget: counts.get(`${r.targetType}:${r.targetId}`) ?? 1,
      }
    }),
    total,
    page,
    limit,
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s._id, s.count])),
  })
}))

/** Claim a report so two admins do not action the same one. */
router.post('/admin/:id/claim', authenticate, requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const report = await ContentReport.findOneAndUpdate(
    { _id: param(req.params.id), status: 'open' },
    { $set: { status: 'reviewing', handledBy: req.user!.userId } },
    { returnDocument: 'after' },
  )
  if (!report) { error(res, 'That report is not open — someone may already have it.', 409); return }

  success(res, { id: String(report._id), status: report.status }, 'Report claimed')
}))

router.post('/admin/:id/takeover', authenticate, requireRole('super_admin'), asyncHandler(async (req, res) => {
  const previous = await ContentReport.findOneAndUpdate(
    { _id: param(req.params.id), status: 'reviewing', handledBy: { $ne: req.user!.userId } },
    { $set: { handledBy: req.user!.userId } },
    { returnDocument: 'before' },
  )
  if (!previous) { error(res, 'Only another moderator’s active claim can be taken over.', 409); return }
  await recordAudit(req, 'report.claim_taken_over', 'ContentReport', String(previous._id), { previousModeratorId: previous.handledBy, pendingAction: previous.pendingAction })
  success(res, { id: String(previous._id), status: 'reviewing' }, 'Claim transferred. Any saved decision must be completed unchanged.')
}))

router.post('/admin/:id/release', authenticate, requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const filter: Record<string, unknown> = { _id: param(req.params.id), status: 'reviewing', pendingAction: { $exists: false } }
  if (!req.user!.roles.includes('super_admin')) filter.handledBy = req.user!.userId
  const released = await ContentReport.findOneAndUpdate(filter, { $set: { status: 'open' }, $unset: { handledBy: 1 } }, { returnDocument: 'after' })
  if (!released) { error(res, 'Only the assigned moderator or a super admin can release an undecided claim.', 409); return }
  await recordAudit(req, 'report.released', 'ContentReport', String(released._id), {})
  success(res, { id: String(released._id), status: released.status }, 'Report returned to the queue')
}))

const resolveSchema = z.object({
  action: z.enum(['none', 'content_removed', 'account_suspended']),
  note: z.string().trim().min(3).max(1000),
})

/**
 * Resolve a report.
 *
 * `content_removed` is the only action that touches the reported item, and it
 * suspends rather than deletes so the decision can be reviewed and undone.
 */
router.post('/admin/:id/resolve', authenticate, requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const parsed = resolveSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const report = await ContentReport.findById(param(req.params.id))
  if (!report) { error(res, 'Report not found', 404); return }

  const allowed = canResolveReport(report.status)
  if (!allowed.ok) { error(res, allowed.reason ?? 'This report cannot be changed.', 409); return }
  if (report.status !== 'reviewing' || report.handledBy !== req.user!.userId) {
    error(res, 'Claim this report before resolving it. Only its assigned moderator can resolve it.', 409); return
  }
  if ((parsed.data.action === 'account_suspended' && report.targetType !== 'user') || (parsed.data.action === 'content_removed' && report.targetType === 'user')) {
    error(res, 'This decision does not apply to the reported target.', 422); return
  }
  if (parsed.data.action === 'account_suspended' && !await User.exists({ _id: report.targetId, roles: { $nin: ['admin', 'super_admin'] }, deletedAt: { $exists: false } })) {
    error(res, 'This account cannot be suspended through content moderation.', 422); return
  }

  // Persist the intended decision before applying its idempotent side effect.
  // A failed/crashed request can retry the same decision, but another request
  // cannot turn a partially applied removal into a dismissal or release it.
  const reserved = await ContentReport.findOneAndUpdate({
    _id: report._id, status: 'reviewing', handledBy: req.user!.userId,
    $or: [{ pendingAction: { $exists: false } }, { pendingAction: parsed.data.action, pendingNote: parsed.data.note }],
  }, { $set: { pendingAction: parsed.data.action, pendingNote: parsed.data.note } }, { returnDocument: 'after' })
  if (!reserved) { error(res, 'A different decision is already in progress. Refresh the report and retry its saved decision.', 409); return }

  if (parsed.data.action === 'account_suspended' && !await suspendAccount(report.targetId, String(report._id), parsed.data.note)) {
    error(res, 'Account suspension could not be applied. Refresh and review the account.', 409); return
  }

  if (parsed.data.action === 'content_removed') {
    const removed = await removeReportedContent(report.targetType, report.targetId, parsed.data.note)
    if (!removed) {
      await ContentReport.updateOne({ _id: report._id, status: 'reviewing', pendingAction: parsed.data.action, pendingNote: parsed.data.note }, { $unset: { pendingAction: 1, pendingNote: 1 } })
      error(res, 'That item no longer exists. Record a dismissal explaining that it is unavailable.', 404); return
    }
  }

  const finalized = await ContentReport.updateOne({
    _id: report._id, status: 'reviewing', handledBy: req.user!.userId,
    pendingAction: parsed.data.action, pendingNote: parsed.data.note,
  }, { $set: { status: statusForAction(parsed.data.action), action: parsed.data.action, resolutionNote: parsed.data.note, handledAt: new Date() } })
  if (!finalized.modifiedCount) { error(res, 'This decision has already been completed. Refresh the queue.', 409); return }
  report.status = statusForAction(parsed.data.action)
  report.action = parsed.data.action

  // Every open report against the same item is resolved together: leaving the
  // duplicates open would make one removal look like ten outstanding problems.
  if (parsed.data.action === 'content_removed') {
    await ContentReport.updateMany(
      {
        _id: { $ne: report._id },
        targetType: report.targetType,
        targetId: report.targetId,
        status: { $in: ['open', 'reviewing'] },
        pendingAction: { $exists: false },
      },
      {
        $set: {
          status: 'actioned',
          action: 'content_removed',
          resolutionNote: `Resolved with report ${String(report._id)}.`,
          handledBy: req.user!.userId,
          handledAt: new Date(),
        },
      },
    )
  }

  await recordAudit(req, `report.${report.status}`, 'ContentReport', String(report._id), {
    action: parsed.data.action,
    targetType: report.targetType,
    targetId: report.targetId,
  })

  success(res, { id: String(report._id), status: report.status, action: report.action }, 'Report resolved')
}))

router.post('/admin/:id/restore-account', authenticate, requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const parsed = z.object({ note: z.string().trim().min(3).max(1000) }).safeParse(req.body)
  if (!parsed.success) { error(res, 'Provide a reason for restoring access.', 400); return }
  const report = await ContentReport.findById(param(req.params.id))
  if (!report || report.targetType !== 'user' || report.action !== 'account_suspended' || report.status !== 'actioned') { error(res, 'Suspension decision not found', 404); return }
  const restored = await User.updateOne({ _id: report.targetId, suspensionReportId: String(report._id), suspendedAt: { $exists: true } }, { $unset: { suspendedAt: 1, suspensionReason: 1, suspensionReportId: 1 } })
  if (!restored.modifiedCount) { error(res, 'This suspension is no longer active.', 409); return }
  await recordAudit(req, 'account.restored', 'User', report.targetId, { reportId: String(report._id), reason: parsed.data.note })
  success(res, null, 'Account access restored')
}))

export default router

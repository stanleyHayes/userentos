import { Router } from 'express'
import { z } from 'zod'
import { Types } from 'mongoose'
import { authenticate } from '../middleware/auth.js'
import { Lead } from '../models/Lead.js'
import { Viewing } from '../models/Viewing.js'
import { Commission } from '../models/Commission.js'
import { Property } from '../models/Property.js'
import { User } from '../models/User.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { notify } from '../services/notify.js'
import { VIEWING_REQUESTED_TITLE, viewingRequestedMessage } from '../services/enquiryNotices.js'
import { agentForProperty, recordEnquiry, findOpenLead, leadForAgent } from '../services/leads.js'
import { openEnquiryConversation, findConversation, sendFailureBody, MESSAGING_UNAVAILABLE } from '../services/conversations.js'
import { screenOutbound, blockedBody } from '../services/trust/screen.js'
import { Conversation } from '../models/Conversation.js'
import { contactBlocked } from '../services/userBlocks.js'
import { logger } from '../utils/logger.js'
import { round2 } from '../utils/money.js'

const router = Router()

const idOf = <T extends { _id: unknown }>(doc: T) => ({
  ...doc,
  id: (doc._id as Types.ObjectId).toString(),
})

/* ================================================================
   LEADS — "I'm interested" on a listing creates a lead and opens a
   RentOS conversation with the agent; the agent replies there (never
   by phone: the enquirer's number and email are not shared) and works
   the pipeline: new → contacted → viewing → applied → closed/lost
   ================================================================ */
const leadSchema = z.object({
  message: z.string().trim().max(500).optional(),
})

// POST /api/agent/leads/property/:propertyId — express interest (any signed-in user)
router.post('/leads/property/:propertyId', authenticate, async (req, res) => {
  const parsed = leadSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const resolved = await agentForProperty(param(req.params.propertyId))
  if (!resolved || !resolved.agentId) { error(res, 'Property not found', 404); return }
  if (resolved.agentId === req.user!.userId) { error(res, 'You cannot inquire about your own listing', 400); return }

  const requester = await User.findById(req.user!.userId).lean()
  if (!requester) { error(res, 'User not found', 404); return }

  const propertyId = param(req.params.propertyId)
  const title = resolved.property.title ?? 'your listing'
  const text = parsed.data.message || `Hi, I'm interested in "${title}". Is it still available?`
  // The message is screened (TRUST-2) before anything is created. A new lead
  // alerts the agent itself (with email and SMS), so the message adds no
  // second alert; a repeat enquiry is announced by the message alone.
  const repeat = await findOpenLead({ propertyId, agentId: resolved.agentId, requesterId: req.user!.userId })
  const opened = await openEnquiryConversation({ senderId: req.user!.userId, recipientId: resolved.agentId, propertyId, text, channel: 'interest', alerted: !repeat })
  if (!opened.ok) { res.status(opened.status).json(sendFailureBody(opened)); return }

  const { lead, created } = await recordEnquiry({
    propertyId,
    propertyTitle: resolved.property.title,
    agentId: resolved.agentId,
    requesterId: req.user!.userId,
    contact: { name: `${requester.firstName} ${requester.lastName}`.trim() },
    message: parsed.data.message,
    channel: 'interest',
    conversationId: opened.conversationId,
  })

  success(res, { ...leadForAgent(idOf(lead.toObject())), conversationId: opened.conversationId }, created ? 'Sent — the agent will reply in your RentOS messages' : 'Sent — the agent already has your enquiry and will reply in your RentOS messages', created ? 201 : 200)
})

// GET /api/agent/leads — my lead inbox (agent side), optional status/property filter
router.get('/leads', authenticate, async (req, res) => {
  const filter: Record<string, unknown> = { agentId: req.user!.userId }
  if (typeof req.query.status === 'string' && req.query.status) filter.status = req.query.status
  if (typeof req.query.propertyId === 'string' && req.query.propertyId) filter.propertyId = req.query.propertyId

  const leads = await Lead.find(filter).sort({ createdAt: -1 }).limit(200).lean()
  // A general enquiry from the agent's website contact page has no property.
  const propertyIds = [...new Set(leads.map((l) => l.propertyId).filter((id): id is string => Boolean(id)))]
  const properties = await Property.find({ _id: { $in: propertyIds } }).select('title address').lean()
  const propertyMap = new Map(properties.map((p) => [(p._id as Types.ObjectId).toString(), p]))

  success(res, {
    // Never the enquirer's phone or email: the agent replies on RentOS.
    items: leads.map((l) => ({
      ...leadForAgent(idOf(l)),
      canReply: Boolean(l.requesterId),
      propertyTitle: l.propertyId ? (propertyMap.get(l.propertyId) as { title?: string } | undefined)?.title ?? null : null,
    })),
  })
})

/**
 * "Reply on RentOS": the conversation with the enquirer about this lead's
 * listing, opened if it does not exist yet (older leads predate it).
 */
router.post('/leads/:id/conversation', authenticate, async (req, res) => {
  const lead = await Lead.findById(param(req.params.id))
  if (!lead || lead.agentId !== req.user!.userId) { error(res, 'Lead not found', 404); return }
  if (!lead.requesterId) { error(res, 'This enquirer no longer has a RentOS account.', 410); return }
  const agentId = req.user!.userId
  const requesterId = lead.requesterId

  const linked = lead.conversationId ? await Conversation.findOne({ _id: lead.conversationId, participants: { $all: [agentId, requesterId] } }).select('_id').lean() : null
  let conversationId = linked ? String(linked._id) : undefined
  if (!conversationId) {
    const found = await findConversation(agentId, requesterId, lead.propertyId)
    conversationId = found ? String(found._id) : undefined
  }
  if (!conversationId) {
    const active = await User.exists({ _id: requesterId, deletedAt: { $exists: false }, suspendedAt: { $exists: false } })
    if (!active || await contactBlocked(agentId, requesterId)) { error(res, MESSAGING_UNAVAILABLE, 403); return }
    const created = await Conversation.create({
      participants: [agentId, requesterId],
      propertyId: lead.propertyId,
      unreadCount: new Map([[agentId, 0], [requesterId, 0]]),
    })
    conversationId = created._id.toString()
  }
  if (lead.conversationId !== conversationId) {
    lead.conversationId = conversationId
    await lead.save()
  }
  success(res, { conversationId })
})

// PATCH /api/agent/leads/:id — advance a lead through the pipeline (agent side)
router.patch('/leads/:id', authenticate, async (req, res) => {
  const parsed = z.object({ status: z.enum(['new', 'contacted', 'viewing', 'applied', 'closed', 'lost']) }).safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const lead = await Lead.findById(param(req.params.id))
  if (!lead || lead.agentId !== req.user!.userId) { error(res, 'Lead not found', 404); return }

  lead.status = parsed.data.status
  await lead.save()
  success(res, leadForAgent(idOf(lead.toObject())), 'Lead updated')
})

/* ================================================================
   VIEWINGS — request a slot; agent confirms/completes/cancels
   ================================================================ */
const viewingSchema = z.object({
  leadId: z.string().optional(),
  date: z.string().min(4),
  time: z.string().min(3),
  notes: z.string().max(300).optional(),
})

// POST /api/agent/viewings/property/:propertyId — request a viewing
router.post('/viewings/property/:propertyId', authenticate, async (req, res) => {
  const parsed = viewingSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const resolved = await agentForProperty(param(req.params.propertyId))
  if (!resolved || !resolved.agentId) { error(res, 'Property not found', 404); return }
  if (resolved.agentId === req.user!.userId) { error(res, 'You cannot book a viewing on your own listing', 400); return }

  const requester = await User.findById(req.user!.userId).lean()
  if (!requester) { error(res, 'User not found', 404); return }

  // Notes reach the agent, so they are screened like a message (TRUST-2).
  if (parsed.data.notes) {
    const screened = await screenOutbound({ text: parsed.data.notes, authorId: req.user!.userId, channel: 'viewing', targetType: 'property', targetId: param(req.params.propertyId) })
    if (!screened.allowed) { res.status(422).json(blockedBody(screened)); return }
  }

  // The viewer's name only: the agent arranges the viewing on RentOS.
  const viewing = await Viewing.create({
    ...parsed.data,
    propertyId: param(req.params.propertyId),
    agentId: resolved.agentId,
    requesterId: req.user!.userId,
    viewerName: `${requester.firstName} ${requester.lastName}`.trim(),
  })

  // A viewing request moves the requester's own lead on this listing to
  // 'viewing' — never someone else's lead in the same agent's pipeline.
  if (parsed.data.leadId && Types.ObjectId.isValid(parsed.data.leadId)) {
    await Lead.findOneAndUpdate(
      { _id: parsed.data.leadId, agentId: resolved.agentId, requesterId: req.user!.userId, propertyId: param(req.params.propertyId), status: { $in: ['new', 'contacted'] } },
      { status: 'viewing' },
    )
  }

  notify({
    userId: resolved.agentId,
    title: VIEWING_REQUESTED_TITLE,
    message: viewingRequestedMessage(parsed.data.date, parsed.data.time),
    actionUrl: '/dashboard',
  }).catch((err) => logger.warn('[Agent] viewing notify failed:', err))

  success(res, idOf(viewing.toObject()), 'Viewing requested', 201)
})

// GET /api/agent/viewings — agent's calendar (or mine as requester with ?asRequester=true)
router.get('/viewings', authenticate, async (req, res) => {
  const asRequester = req.query.asRequester === 'true'
  const filter: Record<string, unknown> = asRequester ? { requesterId: req.user!.userId } : { agentId: req.user!.userId }
  if (typeof req.query.status === 'string' && req.query.status) filter.status = req.query.status

  const viewings = await Viewing.find(filter).sort({ date: 1, time: 1 }).limit(200).lean()
  const propertyIds = [...new Set(viewings.map((v) => v.propertyId))]
  const properties = await Property.find({ _id: { $in: propertyIds } }).select('title address').lean()
  const propertyMap = new Map(properties.map((p) => [(p._id as Types.ObjectId).toString(), p]))

  success(res, {
    items: viewings.map((v) => {
      const { viewerPhone: _phone, ...rest } = idOf(v)
      return { ...rest, propertyTitle: (propertyMap.get(v.propertyId) as { title?: string } | undefined)?.title ?? null }
    }),
  })
})

// PATCH /api/agent/viewings/:id — confirm/complete/cancel (agent side; requester may cancel)
router.patch('/viewings/:id', authenticate, async (req, res) => {
  const parsed = z.object({ status: z.enum(['confirmed', 'completed', 'cancelled']) }).safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const viewing = await Viewing.findById(param(req.params.id))
  if (!viewing) { error(res, 'Viewing not found', 404); return }
  const isAgent = viewing.agentId === req.user!.userId
  const isRequester = viewing.requesterId === req.user!.userId
  if (!isAgent && !isRequester) { error(res, 'Not authorized', 403); return }
  if (!isAgent && parsed.data.status !== 'cancelled') { error(res, 'Only the agent can update this viewing', 403); return }

  viewing.status = parsed.data.status
  await viewing.save()
  const { viewerPhone: _phone, ...updated } = idOf(viewing.toObject())
  success(res, updated, 'Viewing updated')
})

/* ================================================================
   COMMISSIONS — agent records earnings per closed deal
   ================================================================ */
const commissionSchema = z.object({
  propertyId: z.string().optional(),
  leadId: z.string().optional(),
  agreementId: z.string().optional(),
  description: z.string().min(2).max(200),
  amount: z.number().positive(),
})

// POST /api/agent/commissions — record a commission (agent side)
router.post('/commissions', authenticate, async (req, res) => {
  const parsed = commissionSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const commission = await Commission.create({
    ...parsed.data,
    amount: round2(parsed.data.amount),
    agentId: req.user!.userId,
  })
  success(res, idOf(commission.toObject()), 'Commission recorded', 201)
})

// GET /api/agent/commissions — my commissions + pending/paid summary
router.get('/commissions', authenticate, async (req, res) => {
  const commissions = await Commission.find({ agentId: req.user!.userId }).sort({ createdAt: -1 }).limit(200).lean()
  const pending = commissions.filter((c) => c.status === 'pending').reduce((s, c) => s + c.amount, 0)
  const paid = commissions.filter((c) => c.status === 'paid').reduce((s, c) => s + c.amount, 0)

  success(res, {
    items: commissions.map(idOf),
    summary: { pending: round2(pending), paid: round2(paid), count: commissions.length },
  })
})

// PATCH /api/agent/commissions/:id/paid — mark a commission paid
router.patch('/commissions/:id/paid', authenticate, async (req, res) => {
  const commission = await Commission.findById(param(req.params.id))
  if (!commission || commission.agentId !== req.user!.userId) { error(res, 'Commission not found', 404); return }
  if (commission.status === 'paid') { error(res, 'Already marked paid', 409); return }

  commission.status = 'paid'
  commission.paidAt = new Date()
  await commission.save()
  success(res, idOf(commission.toObject()), 'Commission marked paid')
})

export default router

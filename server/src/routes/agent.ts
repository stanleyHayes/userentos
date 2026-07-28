import { Router } from 'express'
import { z } from 'zod'
import type { Types } from 'mongoose'
import { authenticate } from '../middleware/auth.js'
import { Lead } from '../models/Lead.js'
import { Viewing } from '../models/Viewing.js'
import { Commission } from '../models/Commission.js'
import { Property } from '../models/Property.js'
import { User } from '../models/User.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { notify } from '../services/notify.js'
import { logger } from '../utils/logger.js'
import { round2 } from '../utils/money.js'

const router = Router()

const idOf = <T extends { _id: unknown }>(doc: T) => ({
  ...doc,
  id: (doc._id as Types.ObjectId).toString(),
})

/** Resolve the agent (owner or manager) who should receive leads for a property. */
async function agentForProperty(propertyId: string) {
  const property = await Property.findById(propertyId).lean()
  if (!property) return null
  const p = property as unknown as { landlordId?: string; managerId?: string }
  return { property, agentId: p.managerId ?? p.landlordId ?? null }
}

/* ================================================================
   LEADS — "I'm interested" on a listing creates a lead; the agent
   works the pipeline: new → contacted → viewing → applied → closed/lost
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

  const lead = await Lead.create({
    ...parsed.data,
    propertyId: param(req.params.propertyId),
    agentId: resolved.agentId,
    requesterId: req.user!.userId,
    contactName: `${requester.firstName} ${requester.lastName}`.trim(),
    contactPhone: requester.phone,
    contactEmail: requester.email,
  })

  notify({
    userId: resolved.agentId,
    title: 'New Lead',
    message: `${lead.contactName} is interested in your listing. Reach them at ${requester.phone}.`,
    actionUrl: '/dashboard',
  }).catch((err) => logger.warn('[Agent] lead notify failed:', err))

  success(res, idOf(lead.toObject()), 'Interest sent — the agent will contact you', 201)
})

// GET /api/agent/leads — my lead inbox (agent side), optional status/property filter
router.get('/leads', authenticate, async (req, res) => {
  const filter: Record<string, unknown> = { agentId: req.user!.userId }
  if (typeof req.query.status === 'string' && req.query.status) filter.status = req.query.status
  if (typeof req.query.propertyId === 'string' && req.query.propertyId) filter.propertyId = req.query.propertyId

  const leads = await Lead.find(filter).sort({ createdAt: -1 }).limit(200).lean()
  const propertyIds = [...new Set(leads.map((l) => l.propertyId))]
  const properties = await Property.find({ _id: { $in: propertyIds } }).select('title address').lean()
  const propertyMap = new Map(properties.map((p) => [(p._id as Types.ObjectId).toString(), p]))

  success(res, {
    items: leads.map((l) => ({
      ...idOf(l),
      propertyTitle: (propertyMap.get(l.propertyId) as { title?: string } | undefined)?.title ?? null,
    })),
  })
})

// PATCH /api/agent/leads/:id — advance a lead through the pipeline (agent side)
router.patch('/leads/:id', authenticate, async (req, res) => {
  const parsed = z.object({ status: z.enum(['new', 'contacted', 'viewing', 'applied', 'closed', 'lost']) }).safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const lead = await Lead.findById(param(req.params.id))
  if (!lead || lead.agentId !== req.user!.userId) { error(res, 'Lead not found', 404); return }

  lead.status = parsed.data.status
  await lead.save()
  success(res, idOf(lead.toObject()), 'Lead updated')
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

  const viewing = await Viewing.create({
    ...parsed.data,
    propertyId: param(req.params.propertyId),
    agentId: resolved.agentId,
    requesterId: req.user!.userId,
    viewerName: `${requester.firstName} ${requester.lastName}`.trim(),
    viewerPhone: requester.phone,
  })

  // A viewing request moves the lead (if any) to 'viewing'
  if (parsed.data.leadId) {
    await Lead.findOneAndUpdate(
      { _id: parsed.data.leadId, agentId: resolved.agentId, status: { $in: ['new', 'contacted'] } },
      { status: 'viewing' },
    )
  }

  notify({
    userId: resolved.agentId,
    title: 'Viewing Requested',
    message: `${viewing.viewerName} requested a viewing on ${parsed.data.date} at ${parsed.data.time}.`,
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
    items: viewings.map((v) => ({
      ...idOf(v),
      propertyTitle: (propertyMap.get(v.propertyId) as { title?: string } | undefined)?.title ?? null,
    })),
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
  success(res, idOf(viewing.toObject()), 'Viewing updated')
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

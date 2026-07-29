import { Router } from 'express'
import { z } from 'zod'
import type { Types } from 'mongoose'
import { authenticate, requireRole } from '../middleware/auth.js'
import { RenewalOffer } from '../models/RenewalOffer.js'
import { Agreement } from '../models/Agreement.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { round2 } from '../utils/money.js'
import { notify } from '../services/notify.js'
import { logger } from '../utils/logger.js'

const router = Router()

const idOf = <T extends { _id: unknown }>(doc: T) => ({
  ...doc,
  id: (doc._id as Types.ObjectId).toString(),
})

/* ================================================================
   RENEWAL OFFERS — landlord proposes a new term (optionally with a
   rent adjustment); tenant accepts (agreement extended) or declines.
   ================================================================ */

// POST /api/renewals/agreement/:agreementId — landlord creates the offer
router.post('/agreement/:agreementId', authenticate, requireRole('landlord', 'property_manager'), async (req, res) => {
  const parsed = z.object({
    proposedRent: z.number().positive(),
    proposedEndDate: z.string().min(4),
    message: z.string().max(300).optional(),
  }).safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const agreement = await Agreement.findById(param(req.params.agreementId))
  if (!agreement || agreement.landlordId !== req.user!.userId) { error(res, 'Agreement not found', 404); return }
  if (agreement.status !== 'active') { error(res, 'Only active agreements can be renewed', 409); return }

  // One open offer per agreement — a second offer would confuse the tenant.
  const existing = await RenewalOffer.findOne({ agreementId: agreement._id.toString(), status: 'pending' })
  if (existing) { error(res, 'There is already a pending renewal offer for this agreement', 409); return }

  const offer = await RenewalOffer.create({
    ...parsed.data,
    proposedRent: round2(parsed.data.proposedRent),
    agreementId: agreement._id.toString(),
    landlordId: req.user!.userId,
    tenantId: agreement.tenantId,
  })

  agreement.renewalStatus = 'pending'
  await agreement.save()

  notify({
    userId: agreement.tenantId,
    title: 'Renewal Offer',
    message: `Your landlord offered to renew your agreement at GHS ${parsed.data.proposedRent.toFixed(2)}/month until ${parsed.data.proposedEndDate}.`,
    actionUrl: '/agreements',
  }).catch((err) => logger.warn('[Renewals] notify failed:', err))

  success(res, idOf(offer.toObject()), 'Renewal offer sent', 201)
})

// GET /api/renewals?role=landlord|tenant — my offers
router.get('/', authenticate, async (req, res) => {
  const asLandlord = req.query.role === 'landlord'
  const filter: Record<string, unknown> = asLandlord ? { landlordId: req.user!.userId } : { tenantId: req.user!.userId }
  if (typeof req.query.status === 'string' && req.query.status) filter.status = req.query.status

  const offers = await RenewalOffer.find(filter).sort({ createdAt: -1 }).limit(100).lean()
  success(res, { items: offers.map(idOf) })
})

// POST /api/renewals/:id/respond — tenant accepts or declines
router.post('/:id/respond', authenticate, requireRole('tenant'), async (req, res) => {
  const parsed = z.object({ accept: z.boolean() }).safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const offer = await RenewalOffer.findById(param(req.params.id))
  if (!offer || offer.tenantId !== req.user!.userId) { error(res, 'Offer not found', 404); return }
  if (offer.status !== 'pending') { error(res, `Offer already ${offer.status}`, 409); return }

  const agreement = await Agreement.findById(offer.agreementId)
  if (!agreement) { error(res, 'Agreement not found', 404); return }

  offer.status = parsed.data.accept ? 'accepted' : 'declined'
  offer.respondedAt = new Date()

  if (parsed.data.accept) {
    // Extend the existing agreement at the proposed terms.
    agreement.endDate = offer.proposedEndDate
    agreement.rentAmount = offer.proposedRent
    agreement.renewalStatus = 'renewed'
  } else {
    agreement.renewalStatus = 'tenant_declined'
    agreement.renewalDeclinedBy = req.user!.userId
    agreement.renewalDeclinedAt = new Date()
  }
  await agreement.save()
  await offer.save()

  notify({
    userId: offer.landlordId,
    title: parsed.data.accept ? 'Renewal Accepted' : 'Renewal Declined',
    message: parsed.data.accept
      ? `Your tenant accepted the renewal — the agreement now runs until ${offer.proposedEndDate}.`
      : 'Your tenant declined the renewal offer.',
    actionUrl: '/agreements',
  }).catch((err) => logger.warn('[Renewals] notify failed:', err))

  success(res, idOf(offer.toObject()), parsed.data.accept ? 'Renewal accepted' : 'Renewal declined')
})

export default router

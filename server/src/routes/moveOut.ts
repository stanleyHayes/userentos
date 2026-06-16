import { Router, Request, Response } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import crypto from 'crypto'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { MoveOut } from '../models/MoveOut.js'
import { Agreement } from '../models/Agreement.js'
import { Property } from '../models/Property.js'
import { User } from '../models/User.js'
import { Wallet } from '../models/Wallet.js'
import { notify } from '../services/notify.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'

const router = Router()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function idOf(doc: any): any {
  return { ...doc, id: (doc._id as Types.ObjectId).toString() }
}

function isAdminRole(roles: string[]): boolean {
  return roles.includes('admin') || roles.includes('super_admin') || roles.includes('government')
}

function isParty(mo: { tenantId: string; landlordId: string }, userId: string): boolean {
  return mo.tenantId === userId || mo.landlordId === userId
}

function recomputeRefund(damages: { cost: number }[], deposit: number): { deductionsTotal: number; refundAmount: number } {
  const deductionsTotal = damages.reduce((sum, d) => sum + (Number(d.cost) || 0), 0)
  const refundAmount = Math.max(0, deposit - deductionsTotal)
  return { deductionsTotal, refundAmount }
}

// ─── GET /api/move-outs ───────────────────────────────────────────
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const roles = req.user!.roles
    const filter: Record<string, unknown> = isAdminRole(roles)
      ? {}
      : { $or: [{ tenantId: userId }, { landlordId: userId }] }

    const items = await MoveOut.find(filter).sort({ createdAt: -1 }).lean()

    // Enrich with property + party names for the list
    const propertyIds = [...new Set(items.map((m) => m.propertyId))]
    const userIds = [...new Set(items.flatMap((m) => [m.tenantId, m.landlordId]))]
    const [properties, users] = await Promise.all([
      Property.find({ _id: { $in: propertyIds } }).select('title address').lean(),
      User.find({ _id: { $in: userIds } }).select('firstName lastName email').lean(),
    ])
    const propertyMap = new Map(properties.map((p) => [(p._id as Types.ObjectId).toString(), p]))
    const userMap = new Map(users.map((u) => [(u._id as Types.ObjectId).toString(), u]))

    const enriched = items.map((m) => {
      const tenant = userMap.get(m.tenantId)
      const landlord = userMap.get(m.landlordId)
      const property = propertyMap.get(m.propertyId)
      return {
        ...m,
        id: (m._id as Types.ObjectId).toString(),
        tenantName: tenant ? `${tenant.firstName ?? ''} ${tenant.lastName ?? ''}`.trim() : undefined,
        landlordName: landlord ? `${landlord.firstName ?? ''} ${landlord.lastName ?? ''}`.trim() : undefined,
        propertyTitle: property?.title,
      }
    })

    success(res, { items: enriched, total: enriched.length, page: 1, pageSize: enriched.length, totalPages: 1 })
  })
)

// ─── POST /api/move-outs ───────────────────────────────────────────
const initiateSchema = z.object({
  agreementId: z.string().min(1),
  moveOutDate: z.string().min(1),
})

router.post(
  '/',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const parsed = initiateSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.errors[0].message); return }

    const agreement = await Agreement.findById(parsed.data.agreementId)
    if (!agreement) { error(res, 'Agreement not found', 404); return }
    if (userId !== agreement.tenantId && userId !== agreement.landlordId) {
      error(res, 'Not a party to this agreement', 403); return
    }

    // Idempotency: do not create another in-flight move-out for the same agreement
    const existing = await MoveOut.findOne({
      agreementId: (agreement._id as Types.ObjectId).toString(),
      status: { $ne: 'closed' },
    }).lean()
    if (existing) {
      success(res, { ...existing, id: (existing._id as Types.ObjectId).toString() }, 'Move-out already in progress')
      return
    }

    const initiatedBy: 'tenant' | 'landlord' = userId === agreement.tenantId ? 'tenant' : 'landlord'
    const moveOut = await MoveOut.create({
      agreementId: (agreement._id as Types.ObjectId).toString(),
      tenantId: agreement.tenantId,
      landlordId: agreement.landlordId,
      propertyId: agreement.propertyId,
      status: 'initiated',
      initiatedBy,
      moveOutDate: parsed.data.moveOutDate,
      damages: [],
      securityDeposit: agreement.securityDeposit ?? 0,
      deductionsTotal: 0,
      refundAmount: agreement.securityDeposit ?? 0,
      notes: [],
    })

    const property = await Property.findById(agreement.propertyId).select('title').lean()
    const propertyTitle = property?.title ?? 'your property'
    const otherPartyId = initiatedBy === 'tenant' ? agreement.landlordId : agreement.tenantId
    notify({
      userId: otherPartyId,
      title: 'Move-out Initiated',
      message: `A move-out has been initiated for "${propertyTitle}" effective ${parsed.data.moveOutDate}.`,
      actionUrl: `/agreements/${(agreement._id as Types.ObjectId).toString()}/move-out`,
    })

    success(res, idOf(moveOut.toObject()), 'Move-out initiated', 201)
  })
)

// ─── GET /api/move-outs/:id ───────────────────────────────────────
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const roles = req.user!.roles
    const mo = await MoveOut.findById(param(req.params.id)).lean()
    if (!mo) { error(res, 'Move-out not found', 404); return }
    if (!isAdminRole(roles) && !isParty(mo, userId)) {
      error(res, 'Not authorized', 403); return
    }
    success(res, { ...mo, id: (mo._id as Types.ObjectId).toString() })
  })
)

// ─── POST /api/move-outs/:id/schedule-inspection (landlord) ───────
const scheduleSchema = z.object({ inspectionDate: z.string().min(1) })

router.post(
  '/:id/schedule-inspection',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const mo = await MoveOut.findById(param(req.params.id))
    if (!mo) { error(res, 'Move-out not found', 404); return }
    if (mo.landlordId !== userId) { error(res, 'Only the landlord can schedule the inspection', 403); return }
    if (mo.status === 'closed' || mo.status === 'refund_paid') {
      error(res, 'Cannot schedule an inspection on a closed move-out'); return
    }

    const parsed = scheduleSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.errors[0].message); return }

    mo.inspectionDate = parsed.data.inspectionDate
    mo.status = 'inspection_scheduled'
    await mo.save()

    notify({
      userId: mo.tenantId,
      title: 'Inspection Scheduled',
      message: `Your move-out inspection is scheduled for ${parsed.data.inspectionDate}.`,
      actionUrl: `/agreements/${mo.agreementId}/move-out`,
    })

    success(res, idOf(mo.toObject()))
  })
)

// ─── POST /api/move-outs/:id/inspection (landlord submits) ───────
const damageItemSchema = z.object({
  description: z.string().min(1),
  cost: z.number().min(0),
  photos: z.array(z.string()).default([]),
})
const inspectionSchema = z.object({
  inspectionNotes: z.string().optional(),
  damages: z.array(damageItemSchema).default([]),
})

router.post(
  '/:id/inspection',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const mo = await MoveOut.findById(param(req.params.id))
    if (!mo) { error(res, 'Move-out not found', 404); return }
    if (mo.landlordId !== userId) { error(res, 'Only the landlord can submit inspection', 403); return }
    if (mo.status === 'closed' || mo.status === 'refund_paid') {
      error(res, 'Inspection cannot be submitted on a closed move-out'); return
    }

    const parsed = inspectionSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.errors[0].message); return }

    if (parsed.data.inspectionNotes !== undefined) mo.inspectionNotes = parsed.data.inspectionNotes
    mo.damages = parsed.data.damages.map((d) => ({ description: d.description, cost: d.cost, photos: d.photos }))
    const { deductionsTotal, refundAmount } = recomputeRefund(mo.damages, mo.securityDeposit)
    mo.deductionsTotal = deductionsTotal
    mo.refundAmount = refundAmount

    // If currently disputed, leave the status alone. Otherwise advance to refund_pending.
    if (mo.status !== 'disputed') {
      mo.status = 'refund_pending'
    }
    await mo.save()

    notify({
      userId: mo.tenantId,
      title: 'Inspection Completed',
      message: `Inspection complete. Deductions: GHS ${deductionsTotal.toFixed(2)}. Refund pending: GHS ${refundAmount.toFixed(2)}.`,
      actionUrl: `/agreements/${mo.agreementId}/move-out`,
    })

    success(res, idOf(mo.toObject()))
  })
)

// ─── POST /api/move-outs/:id/dispute (tenant) ───────────────────
const disputeSchema = z.object({ reason: z.string().optional() })

router.post(
  '/:id/dispute',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const mo = await MoveOut.findById(param(req.params.id))
    if (!mo) { error(res, 'Move-out not found', 404); return }
    if (mo.tenantId !== userId) { error(res, 'Only the tenant can dispute findings', 403); return }
    if (mo.status === 'refund_paid' || mo.status === 'closed') {
      error(res, 'Cannot dispute a closed move-out'); return
    }

    const parsed = disputeSchema.safeParse(req.body ?? {})
    if (!parsed.success) { error(res, parsed.error.errors[0].message); return }

    mo.status = 'disputed'
    if (parsed.data.reason) {
      mo.notes.push({ text: `Tenant disputed: ${parsed.data.reason}`, by: userId, at: new Date().toISOString() })
    }
    await mo.save()

    // Notify landlord + admins
    notify({
      userId: mo.landlordId,
      title: 'Move-out Disputed',
      message: 'The tenant has disputed the inspection findings.',
      actionUrl: `/agreements/${mo.agreementId}/move-out`,
    })
    try {
      const admins = await User.find({ roles: { $in: ['admin', 'super_admin'] } }).select('_id').lean()
      for (const a of admins) {
        notify({
          userId: (a._id as Types.ObjectId).toString(),
          title: 'Move-out Dispute',
          message: `A move-out dispute has been raised for agreement ${mo.agreementId.slice(-6)}.`,
          actionUrl: `/admin/move-outs`,
        })
      }
    } catch { /* admins notification is best-effort */ }

    success(res, idOf(mo.toObject()))
  })
)

// ─── POST /api/move-outs/:id/process-refund (landlord) ──────────
router.post(
  '/:id/process-refund',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const mo = await MoveOut.findById(param(req.params.id))
    if (!mo) { error(res, 'Move-out not found', 404); return }
    if (mo.landlordId !== userId) { error(res, 'Only the landlord can process the refund', 403); return }
    if (mo.status === 'refund_paid' || mo.status === 'closed') {
      error(res, 'Refund has already been processed'); return
    }
    if (mo.status === 'disputed') {
      error(res, 'Resolve the dispute before processing the refund'); return
    }

    const refundAmount = Number(mo.refundAmount) || 0
    if (refundAmount > 0) {
      const landlordWallet = await Wallet.findOne({ userId: mo.landlordId })
      if (!landlordWallet || landlordWallet.balance < refundAmount) {
        error(res, `Insufficient landlord wallet balance for refund (need GHS ${refundAmount.toFixed(2)})`); return
      }
      let tenantWallet = await Wallet.findOne({ userId: mo.tenantId })
      if (!tenantWallet) {
        tenantWallet = await Wallet.create({ userId: mo.tenantId, balance: 0, transactions: [] })
      }

      const ref = `REFUND-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
      const now = new Date().toISOString()

      landlordWallet.balance -= refundAmount
      landlordWallet.transactions.push({
        type: 'withdrawal',
        amount: refundAmount,
        balanceAfter: landlordWallet.balance,
        reference: ref,
        description: `Security deposit refund (move-out ${(mo._id as Types.ObjectId).toString().slice(-6)})`,
        createdAt: now,
      })
      tenantWallet.balance += refundAmount
      tenantWallet.transactions.push({
        type: 'deposit',
        amount: refundAmount,
        balanceAfter: tenantWallet.balance,
        reference: ref,
        description: `Security deposit refund (move-out ${(mo._id as Types.ObjectId).toString().slice(-6)})`,
        createdAt: now,
      })
      await landlordWallet.save()
      await tenantWallet.save()
      mo.refundReference = ref
    } else {
      // No refund owed — still issue a reference for traceability
      mo.refundReference = `REFUND-${crypto.randomBytes(4).toString('hex').toUpperCase()}-ZERO`
    }

    mo.refundedAt = new Date().toISOString()
    mo.status = 'refund_paid'
    await mo.save()

    notify({
      userId: mo.tenantId,
      title: 'Refund Processed',
      message: refundAmount > 0
        ? `Your security deposit refund of GHS ${refundAmount.toFixed(2)} has been credited to your wallet (Ref: ${mo.refundReference}).`
        : `Your move-out has been settled with no refund owed (Ref: ${mo.refundReference}).`,
      actionUrl: `/agreements/${mo.agreementId}/move-out`,
    })

    success(res, idOf(mo.toObject()))
  })
)

// ─── POST /api/move-outs/:id/acknowledge ────────────────────────
router.post(
  '/:id/acknowledge',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const mo = await MoveOut.findById(param(req.params.id))
    if (!mo) { error(res, 'Move-out not found', 404); return }
    if (!isParty(mo, userId)) { error(res, 'Not a party to this move-out', 403); return }

    const now = new Date().toISOString()
    if (mo.tenantId === userId) {
      mo.tenantAcknowledgedAt = mo.tenantAcknowledgedAt ?? now
    } else {
      mo.landlordAcknowledgedAt = mo.landlordAcknowledgedAt ?? now
    }
    if (mo.tenantAcknowledgedAt && mo.landlordAcknowledgedAt) {
      mo.status = 'closed'
      // When closed, mark the agreement as expired if still active
      try {
        const agreement = await Agreement.findById(mo.agreementId)
        if (agreement && agreement.status === 'active') {
          agreement.status = 'expired'
          await agreement.save()
        }
      } catch { /* best-effort */ }
    }
    await mo.save()

    const otherPartyId = mo.tenantId === userId ? mo.landlordId : mo.tenantId
    notify({
      userId: otherPartyId,
      title: 'Move-out Acknowledged',
      message: mo.status === 'closed' ? 'The move-out has been fully acknowledged and closed.' : 'The other party has acknowledged the move-out.',
      actionUrl: `/agreements/${mo.agreementId}/move-out`,
    })

    success(res, idOf(mo.toObject()))
  })
)

// ─── POST /api/move-outs/:id/notes ──────────────────────────────
const noteSchema = z.object({ text: z.string().min(1) })

router.post(
  '/:id/notes',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const roles = req.user!.roles
    const mo = await MoveOut.findById(param(req.params.id))
    if (!mo) { error(res, 'Move-out not found', 404); return }
    if (!isAdminRole(roles) && !isParty(mo, userId)) {
      error(res, 'Not authorized', 403); return
    }
    const parsed = noteSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.errors[0].message); return }
    mo.notes.push({ text: parsed.data.text, by: userId, at: new Date().toISOString() })
    await mo.save()
    success(res, idOf(mo.toObject()))
  })
)

export default router

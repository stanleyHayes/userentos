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
import { notify } from '../services/notify.js'
import { creditWallet, debitWallet } from '../services/payments/walletLedger.js'
import { withMoneyTransaction, InsufficientFundsError } from '../services/payments/moneyTransaction.js'
import { round2 } from '../utils/money.js'
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

// A disputed move-out is frozen until staff resolve it; closed/paid are terminal.
const LOCKED_STATUSES = ['refund_paid', 'closed', 'disputed'] as const

function lockedError(res: Response, status: string | undefined) {
  error(res, status === 'disputed'
    ? 'This move-out is disputed — it is frozen until the dispute is resolved'
    : 'This move-out is already settled', 409)
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

    const items = await MoveOut.find(filter).sort({ createdAt: -1 }).limit(200).lean()

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
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    const agreement = await Agreement.findById(parsed.data.agreementId)
    if (!agreement) { error(res, 'Agreement not found', 404); return }
    if (userId !== agreement.tenantId && userId !== agreement.landlordId) {
      error(res, 'Not a party to this agreement', 403); return
    }
    // Move-outs only make sense on a live lease — not on drafts or pending signatures.
    if (agreement.status !== 'active') {
      error(res, `Cannot start a move-out on a ${agreement.status} agreement`, 409)
      return
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
    void notify({
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

    const parsed = scheduleSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    // Rescheduling must not walk a disputed move-out out of 'disputed' — that
    // would re-enable process-refund without the dispute ever being resolved.
    const scheduled = await MoveOut.findOneAndUpdate(
      { _id: mo._id, status: { $nin: [...LOCKED_STATUSES] } },
      { $set: { inspectionDate: parsed.data.inspectionDate, status: 'inspection_scheduled' } },
      { returnDocument: 'after' },
    )
    if (!scheduled) { lockedError(res, (await MoveOut.findById(mo._id).select('status').lean())?.status); return }

    void notify({
      userId: mo.tenantId,
      title: 'Inspection Scheduled',
      message: `Your move-out inspection is scheduled for ${parsed.data.inspectionDate}.`,
      actionUrl: `/agreements/${mo.agreementId}/move-out`,
    })

    success(res, idOf(scheduled.toObject()))
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

    const parsed = inspectionSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    const damages = parsed.data.damages.map((d) => ({ description: d.description, cost: d.cost, photos: d.photos }))
    const { deductionsTotal, refundAmount } = recomputeRefund(damages, mo.securityDeposit)
    // While disputed, the findings under review are frozen: a landlord
    // rewriting the damages would change what the mediator settles on. The
    // status predicate is atomic so a concurrent tenant dispute also wins.
    const inspected = await MoveOut.findOneAndUpdate(
      { _id: mo._id, status: { $nin: [...LOCKED_STATUSES] } },
      { $set: {
        damages, deductionsTotal, refundAmount, status: 'refund_pending',
        ...(parsed.data.inspectionNotes !== undefined ? { inspectionNotes: parsed.data.inspectionNotes } : {}),
      } },
      { returnDocument: 'after' },
    )
    if (!inspected) { lockedError(res, (await MoveOut.findById(mo._id).select('status').lean())?.status); return }

    void notify({
      userId: mo.tenantId,
      title: 'Inspection Completed',
      message: `Inspection complete. Deductions: GHS ${deductionsTotal.toFixed(2)}. Refund pending: GHS ${refundAmount.toFixed(2)}.`,
      actionUrl: `/agreements/${mo.agreementId}/move-out`,
    })

    success(res, idOf(inspected.toObject()))
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
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    mo.preDisputeStatus = mo.status
    mo.status = 'disputed'
    if (parsed.data.reason) {
      mo.notes.push({ text: `Tenant disputed: ${parsed.data.reason}`, by: userId, at: new Date().toISOString() })
    }
    await mo.save()

    // Notify landlord + admins
    void notify({
      userId: mo.landlordId,
      title: 'Move-out Disputed',
      message: 'The tenant has disputed the inspection findings.',
      actionUrl: `/agreements/${mo.agreementId}/move-out`,
    })
    try {
      const admins = await User.find({ roles: { $in: ['admin', 'super_admin'] } }).select('_id').lean()
      for (const a of admins) {
        void notify({
          userId: (a._id as Types.ObjectId).toString(),
          title: 'Move-out Dispute',
          message: `A move-out dispute has been raised for agreement ${mo.agreementId.slice(-6)}.`,
          actionUrl: `/agreements/${mo.agreementId}`,
        })
      }
    } catch { /* admins notification is best-effort */ }

    success(res, idOf(mo.toObject()))
  })
)

// ─── POST /api/move-outs/:id/withdraw-dispute (tenant) ──────────
// Tenant accepts the inspection after all — returns to the pre-dispute status.
router.post(
  '/:id/withdraw-dispute',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const mo = await MoveOut.findById(param(req.params.id))
    if (!mo) { error(res, 'Move-out not found', 404); return }
    if (mo.tenantId !== userId) { error(res, 'Only the tenant can withdraw their dispute', 403); return }
    if (mo.status !== 'disputed') { error(res, 'This move-out is not disputed', 409); return }

    mo.status = mo.preDisputeStatus ?? 'inspected'
    mo.preDisputeStatus = undefined
    mo.notes.push({ text: 'Tenant withdrew the dispute', by: userId, at: new Date().toISOString() })
    await mo.save()

    void notify({
      userId: mo.landlordId,
      title: 'Dispute Withdrawn',
      message: 'The tenant has withdrawn their move-out dispute. You can now process the refund.',
      actionUrl: `/agreements/${mo.agreementId}/move-out`,
    })

    success(res, idOf(mo.toObject()))
  })
)

// ─── POST /api/move-outs/:id/resolve-dispute (admin/mediator) ──────
// Settles a disputed move-out: optionally adjusts the refund and unblocks the
// landlord's process-refund. Previously a disputed move-out deadlocked forever.
const resolveDisputeSchema = z.object({
  deductionsTotal: z.number().nonnegative().optional(),
  note: z.string().max(2000).optional(),
})

router.post(
  '/:id/resolve-dispute',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId
    if (!isAdminRole(req.user!.roles)) { error(res, 'Only staff can resolve move-out disputes', 403); return }

    const mo = await MoveOut.findById(param(req.params.id))
    if (!mo) { error(res, 'Move-out not found', 404); return }
    if (mo.status !== 'disputed') { error(res, 'This move-out is not disputed', 409); return }

    const parsed = resolveDisputeSchema.safeParse(req.body ?? {})
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    // Staff may adjust the deduction total (e.g. after reviewing evidence).
    if (parsed.data.deductionsTotal !== undefined) {
      mo.deductionsTotal = round2(parsed.data.deductionsTotal)
      mo.refundAmount = round2(Math.max(0, mo.securityDeposit - mo.deductionsTotal))
    }
    mo.status = 'refund_pending'
    mo.preDisputeStatus = undefined
    mo.notes.push({
      text: `Dispute resolved by staff${parsed.data.note ? `: ${parsed.data.note}` : ''}`,
      by: userId,
      at: new Date().toISOString(),
    })
    await mo.save()

    for (const partyId of [mo.tenantId, mo.landlordId]) {
      void notify({
        userId: partyId,
        title: 'Move-out Dispute Resolved',
        message: `The move-out dispute has been resolved. Refund due: GHS ${mo.refundAmount.toFixed(2)}.`,
        actionUrl: `/agreements/${mo.agreementId}/move-out`,
      })
    }

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

    const refundAmount = round2(Number(mo.refundAmount) || 0)
    const ref = `REFUND-${crypto.randomBytes(4).toString('hex').toUpperCase()}`

    if (refundAmount > 0) {
      /*
       * Claim the refund, debit the landlord and credit the tenant as ONE
       * transaction. They used to be three writes with compensation, so a
       * crash after the claim left the move-out 'refund_paid' with nothing
       * transferred. The conditional claim is what stops concurrent or retried
       * calls from paying twice. (On a standalone Mongo each step is undone
       * if a later one fails.)
       */
      const description = `Security deposit refund (move-out ${(mo._id as Types.ObjectId).toString().slice(-6)})`
      let claimed
      try {
        claimed = await withMoneyTransaction(async ({ session, onRollback }) => {
          const won = await MoveOut.findOneAndUpdate(
            { _id: mo._id, status: { $nin: [...LOCKED_STATUSES] } },
            { $set: { status: 'refund_paid', refundedAt: new Date().toISOString(), refundReference: ref } },
            { returnDocument: 'after', session },
          )
          if (!won) return null
          onRollback(() => MoveOut.updateOne({ _id: mo._id, refundReference: ref }, { $set: { status: mo.status }, $unset: { refundedAt: 1, refundReference: 1 } }))

          const debited = await debitWallet(mo.landlordId, refundAmount, { type: 'withdrawal', reference: ref, description }, { session })
          if (!debited) throw new InsufficientFundsError()
          onRollback(() => creditWallet(mo.landlordId, refundAmount, { type: 'refund', reference: `${ref}-REV`, description: 'Reversal of failed deposit refund' }))

          await creditWallet(mo.tenantId, refundAmount, { type: 'deposit', reference: ref, description }, { session })
          return won
        })
      } catch (err) {
        if (err instanceof InsufficientFundsError) {
          error(res, `Insufficient landlord wallet balance for refund (need GHS ${refundAmount.toFixed(2)})`)
          return
        }
        console.error(`[moveOut/refund] refund transfer failed and was rolled back for ${mo._id}: ${(err as Error).message}`)
        throw err
      }
      if (!claimed) {
        const current = await MoveOut.findById(mo._id).select('status').lean()
        error(res, current?.status === 'disputed' ? 'Resolve the dispute before processing the refund' : 'Refund has already been processed', 409)
        return
      }

      mo.status = 'refund_paid'
      mo.refundedAt = claimed.refundedAt
      mo.refundReference = ref
    } else {
      // No refund owed — still issue a reference for traceability. Same
      // atomic guard as a paid refund: a zero settlement must not close out a
      // disputed move-out (the dispute may be about the deductions themselves).
      const zeroRef = `REFUND-${crypto.randomBytes(4).toString('hex').toUpperCase()}-ZERO`
      const settled = await MoveOut.findOneAndUpdate(
        { _id: mo._id, status: { $nin: [...LOCKED_STATUSES] } },
        { $set: { status: 'refund_paid', refundedAt: new Date().toISOString(), refundReference: zeroRef } },
        { returnDocument: 'after' },
      )
      if (!settled) {
        const current = await MoveOut.findById(mo._id).select('status').lean()
        error(res, current?.status === 'disputed' ? 'Resolve the dispute before processing the refund' : 'Refund has already been processed', 409)
        return
      }
      mo.status = settled.status
      mo.refundedAt = settled.refundedAt
      mo.refundReference = settled.refundReference
    }

    void notify({
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
    void notify({
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
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
    mo.notes.push({ text: parsed.data.text, by: userId, at: new Date().toISOString() })
    await mo.save()
    success(res, idOf(mo.toObject()))
  })
)

export default router

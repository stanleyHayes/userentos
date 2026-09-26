/**
 * Payments that need a human: GET /api/admin/payments/attention and
 * POST /api/admin/payments/:id/resolve.
 *
 * Nothing exposed these before. A payment held for an amount or currency
 * mismatch, or left uncertain by an interrupted initiation, sat in
 * 'processing' with only the reconciliation sweep ever looking at it — and it
 * blocks a new checkout for the same rent period. Refunds the platform owes,
 * refunds it must recover from a landlord, chargebacks and late successes are
 * flagged on the payment and alerted (services/payments/alerts.ts); this is
 * where an admin finds and closes them.
 */
import { Router } from 'express'
import { z } from 'zod'
import { authenticate, requirePermission } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { Payment } from '../models/Payment.js'
import { MarketplaceTransaction } from '../models/MarketplaceTransaction.js'
import { reconcilePayment } from '../services/payments/reconcilePayments.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { recordAudit } from '../utils/audit.js'

const router = Router()
router.use(authenticate, requirePermission('payments:process'))

/** An uncertain payment is one this old with no answer from the provider. */
const UNCERTAIN_AFTER_MS = 60 * 60_000

const KINDS = ['held', 'uncertain', 'refund_recovery', 'refund_required', 'disputed', 'late_success'] as const
type Kind = (typeof KINDS)[number]

function filterFor(kind: Kind, now: Date): Record<string, unknown> {
  switch (kind) {
    case 'held': return { status: 'processing', failureReason: { $regex: '^(amount_mismatch|currency_unverified)' } }
    case 'uncertain': return { status: { $in: ['pending', 'processing'] }, $or: [{ collectionInitiationUncertainAt: { $exists: true } }, { createdAt: { $lt: new Date(now.getTime() - UNCERTAIN_AFTER_MS) } }] }
    case 'refund_recovery': return { refundRecovery: 'required' }
    case 'refund_required': return { refundStatus: 'required' }
    case 'disputed': return { disputeStatus: 'open' }
    case 'late_success': return { lateSuccessAt: { $exists: true }, resolvedAt: { $exists: false } }
  }
}

function kindsOf(payment: Record<string, unknown>, now: Date): Kind[] {
  const out: Kind[] = []
  const open = payment.status === 'pending' || payment.status === 'processing'
  if (payment.status === 'processing' && /^(amount_mismatch|currency_unverified)/.test(String(payment.failureReason ?? ''))) out.push('held')
  if (open && (payment.collectionInitiationUncertainAt || new Date(payment.createdAt as Date).getTime() < now.getTime() - UNCERTAIN_AFTER_MS)) out.push('uncertain')
  if (payment.refundRecovery === 'required') out.push('refund_recovery')
  if (payment.refundStatus === 'required') out.push('refund_required')
  if (payment.disputeStatus === 'open') out.push('disputed')
  if (payment.lateSuccessAt && !payment.resolvedAt) out.push('late_success')
  return out
}

router.get('/attention', asyncHandler(async (req, res) => {
  const now = new Date()
  const requested = typeof req.query.kind === 'string' ? req.query.kind : ''
  const kinds: Kind[] = (KINDS as readonly string[]).includes(requested) ? [requested as Kind] : [...KINDS]
  const payments = await Payment.find({ $or: kinds.map((kind) => filterFor(kind, now)) })
    .sort({ createdAt: 1 }).limit(200)
    .select('reference purpose method amount status tenantId landlordId agreementId failureReason providerRef collectionSource createdAt paidAt refundedAmount refundRecovery refundRecoveryAmount refundStatus refundReason disputeStatus disputedAt lateSuccessAt collectionInitiationUncertainAt resolvedAt')
    .lean()
  // Marketplace orders owed a refund (a duplicate charge) or under chargeback.
  const orders = !requested || requested === 'refund_required' || requested === 'disputed'
    ? await MarketplaceTransaction.find({ $or: [{ refundStatus: 'required' }, { status: 'disputed' }] })
      .sort({ createdAt: 1 }).limit(200)
      .select('reference purpose grossAmount discountAmount status buyerId sellerId bookingId sponsorshipId refundStatus refundReason duplicateOf refundedAmount disputedAt createdAt')
      .lean()
    : []
  success(res, {
    items: payments.map((p) => ({ ...p, id: String(p._id), attention: kindsOf(p as unknown as Record<string, unknown>, now) })),
    orders: orders.map((o) => ({ ...o, id: String(o._id) })),
    total: payments.length,
  })
}))

const resolveSchema = z.discriminatedUnion('action', [
  // Ask the provider now, through the same path as the reconciliation sweep.
  // Also for a failed payment: a verified success revives it (late success).
  z.object({ action: z.literal('recheck') }),
  // The charge never happened or will never be honoured (e.g. refunded to the payer by hand).
  z.object({ action: z.literal('mark_failed'), note: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal('recovery_resolved'), note: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal('refund_issued'), note: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal('refund_waived'), note: z.string().trim().min(3).max(500) }),
  // Late success or chargeback reviewed; nothing else to change.
  z.object({ action: z.literal('acknowledge'), note: z.string().trim().min(3).max(500) }),
])

router.post('/:id/resolve', asyncHandler(async (req, res) => {
  const parsed = resolveSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const payment = await Payment.findById(param(req.params.id)).lean()
  if (!payment) { error(res, 'Payment not found', 404); return }
  const action = parsed.data
  const resolution = action.action === 'recheck' ? {} : { resolvedBy: req.user!.userId, resolvedAt: new Date(), resolutionNote: action.note }

  if (action.action === 'recheck') {
    if (!['pending', 'processing', 'failed'].includes(payment.status)) { error(res, `This payment is already ${payment.status}`, 409); return }
    const outcome = await reconcilePayment(payment as never)
    void recordAudit(req, 'payment.rechecked', 'Payment', String(payment._id), { outcome })
    const fresh = await Payment.findById(payment._id).lean()
    success(res, { outcome, payment: { ...fresh, id: String(payment._id) } })
    return
  }

  let changed
  if (action.action === 'mark_failed') {
    // Frees the obligation for a new checkout, like any other failure.
    changed = await Payment.updateOne(
      { _id: payment._id, status: { $in: ['pending', 'processing'] } },
      { $set: { status: 'failed', failureReason: `resolved_by_admin: ${action.note}`, ...resolution }, $unset: { openCollectionKey: 1 } },
    )
  } else if (action.action === 'recovery_resolved') {
    changed = await Payment.updateOne({ _id: payment._id, refundRecovery: 'required' }, { $set: { refundRecovery: 'resolved', ...resolution } })
  } else if (action.action === 'refund_issued' || action.action === 'refund_waived') {
    changed = await Payment.updateOne({ _id: payment._id, refundStatus: 'required' }, { $set: { refundStatus: action.action === 'refund_issued' ? 'refunded' : 'waived', ...resolution } })
  } else {
    changed = await Payment.updateOne({ _id: payment._id, $or: [{ lateSuccessAt: { $exists: true } }, { disputeStatus: 'open' }] }, { $set: resolution })
  }
  if (!changed.modifiedCount) { error(res, 'Nothing to resolve: the payment is not in that state', 409); return }

  void recordAudit(req, `payment.resolved.${action.action}`, 'Payment', String(payment._id), { reference: payment.reference, note: action.note })
  const fresh = await Payment.findById(payment._id).lean()
  success(res, { ...fresh, id: String(payment._id) }, 'Payment resolved')
}))

export default router

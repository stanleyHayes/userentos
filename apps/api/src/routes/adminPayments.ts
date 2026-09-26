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
 * where an admin finds and closes them. Marketplace orders owed a refund,
 * under chargeback or paid late are listed as `orders` and resolved through
 * the same route.
 */
import { Router, type Request, type Response } from 'express'
import type { Types } from 'mongoose'
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

/*
 * Late successes and chargebacks are closed by their own acknowledgement,
 * never by resolvedAt: that records the LAST resolution of any kind, so a
 * payment an admin had marked failed (resolvedAt set) and that then succeeded
 * late would never have been listed, and an acknowledged chargeback stayed
 * listed. A late success happens once; a new chargeback clears its
 * acknowledgement (services/payments/refunds.ts).
 */
const UNACKNOWLEDGED_LATE_SUCCESS = { lateSuccessAt: { $exists: true }, lateSuccessAcknowledgedAt: { $exists: false } }
const UNACKNOWLEDGED_DISPUTE = { disputeAcknowledgedAt: { $exists: false } }

function filterFor(kind: Kind, now: Date): Record<string, unknown> {
  switch (kind) {
    case 'held': return { status: 'processing', failureReason: { $regex: '^(amount_mismatch|currency_unverified)' } }
    case 'uncertain': return { status: { $in: ['pending', 'processing'] }, $or: [{ collectionInitiationUncertainAt: { $exists: true } }, { createdAt: { $lt: new Date(now.getTime() - UNCERTAIN_AFTER_MS) } }] }
    case 'refund_recovery': return { refundRecovery: 'required' }
    case 'refund_required': return { refundStatus: 'required' }
    case 'disputed': return { disputeStatus: 'open', ...UNACKNOWLEDGED_DISPUTE }
    case 'late_success': return UNACKNOWLEDGED_LATE_SUCCESS
  }
}

function kindsOf(payment: Record<string, unknown>, now: Date): Kind[] {
  const out: Kind[] = []
  const open = payment.status === 'pending' || payment.status === 'processing'
  if (payment.status === 'processing' && /^(amount_mismatch|currency_unverified)/.test(String(payment.failureReason ?? ''))) out.push('held')
  if (open && (payment.collectionInitiationUncertainAt || new Date(payment.createdAt as Date).getTime() < now.getTime() - UNCERTAIN_AFTER_MS)) out.push('uncertain')
  if (payment.refundRecovery === 'required') out.push('refund_recovery')
  if (payment.refundStatus === 'required') out.push('refund_required')
  if (payment.disputeStatus === 'open' && !payment.disputeAcknowledgedAt) out.push('disputed')
  if (payment.lateSuccessAt && !payment.lateSuccessAcknowledgedAt) out.push('late_success')
  return out
}

/** The same kinds, for a marketplace order. */
const ORDER_FILTERS: Partial<Record<Kind, Record<string, unknown>>> = {
  refund_required: { refundStatus: 'required' },
  disputed: { status: 'disputed', ...UNACKNOWLEDGED_DISPUTE },
  late_success: UNACKNOWLEDGED_LATE_SUCCESS,
}

function orderKindsOf(order: Record<string, unknown>): Kind[] {
  const out: Kind[] = []
  if (order.refundStatus === 'required') out.push('refund_required')
  if (order.status === 'disputed' && !order.disputeAcknowledgedAt) out.push('disputed')
  if (order.lateSuccessAt && !order.lateSuccessAcknowledgedAt) out.push('late_success')
  return out
}

router.get('/attention', asyncHandler(async (req, res) => {
  const now = new Date()
  const requested = typeof req.query.kind === 'string' ? req.query.kind : ''
  const kinds: Kind[] = (KINDS as readonly string[]).includes(requested) ? [requested as Kind] : [...KINDS]
  const payments = await Payment.find({ $or: kinds.map((kind) => filterFor(kind, now)) })
    .sort({ createdAt: 1 }).limit(200)
    .select('reference purpose method amount status tenantId landlordId agreementId failureReason providerRef collectionSource createdAt paidAt refundedAmount refundRecovery refundRecoveryAmount refundStatus refundReason disputeStatus disputedAt disputeAcknowledgedAt lateSuccessAt lateSuccessAcknowledgedAt collectionInitiationUncertainAt resolvedAt')
    .lean()
  // Marketplace orders owed a refund, under chargeback, or paid after their checkout was closed.
  const orderFilters = kinds.flatMap((kind) => ORDER_FILTERS[kind] ? [ORDER_FILTERS[kind]] : [])
  const orders = orderFilters.length
    ? await MarketplaceTransaction.find({ $or: orderFilters })
      .sort({ createdAt: 1 }).limit(200)
      .select('reference purpose grossAmount discountAmount status buyerId sellerId bookingId sponsorshipId refundStatus refundReason duplicateOf refundedAmount disputedAt disputeAcknowledgedAt lateSuccessAt lateSuccessAcknowledgedAt createdAt resolvedAt')
      .lean()
    : []
  success(res, {
    items: payments.map((p) => ({ ...p, id: String(p._id), attention: kindsOf(p as unknown as Record<string, unknown>, now) })),
    orders: orders.map((o) => ({ ...o, id: String(o._id), attention: orderKindsOf(o as unknown as Record<string, unknown>) })),
    total: payments.length,
  })
}))

const note = z.string().trim().min(3).max(500)
const resolveSchema = z.discriminatedUnion('action', [
  // Ask the provider now, through the same path as the reconciliation sweep.
  // Also for a failed payment: a verified success revives it (late success).
  z.object({ action: z.literal('recheck') }),
  // The charge never happened or will never be honoured (e.g. refunded to the payer by hand).
  z.object({ action: z.literal('mark_failed'), note }),
  z.object({ action: z.literal('recovery_resolved'), note }),
  z.object({ action: z.literal('refund_issued'), note }),
  z.object({ action: z.literal('refund_waived'), note }),
  // Reviewed; nothing else to change. Each closes its own flag only.
  z.object({ action: z.literal('acknowledge_late_success'), note }),
  z.object({ action: z.literal('acknowledge_dispute'), note }),
])
type ResolveAction = z.infer<typeof resolveSchema>

/** Which record the id names: `type` when the caller says, otherwise whichever collection has it. */
const targetSchema = z.object({ type: z.enum(['payment', 'order']).optional() })

router.post('/:id/resolve', asyncHandler(async (req, res) => {
  const parsed = resolveSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const target = targetSchema.safeParse(req.body)
  if (!target.success) { error(res, target.error.issues[0].message); return }
  const id = param(req.params.id)
  const action = parsed.data

  const payment = target.data.type === 'order' ? null : await Payment.findById(id).lean()
  if (!payment) {
    const order = target.data.type === 'payment' ? null : await MarketplaceTransaction.findById(id).lean()
    if (!order) { error(res, target.data.type === 'order' ? 'Order not found' : 'Payment not found', 404); return }
    await resolveOrder(req, res, order, action)
    return
  }
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
  } else if (action.action === 'acknowledge_late_success') {
    changed = await Payment.updateOne({ _id: payment._id, ...UNACKNOWLEDGED_LATE_SUCCESS }, { $set: { lateSuccessAcknowledgedAt: new Date(), ...resolution } })
  } else {
    changed = await Payment.updateOne({ _id: payment._id, disputeStatus: 'open', ...UNACKNOWLEDGED_DISPUTE }, { $set: { disputeAcknowledgedAt: new Date(), ...resolution } })
  }
  if (!changed.modifiedCount) { error(res, 'Nothing to resolve: the payment is not in that state', 409); return }

  void recordAudit(req, `payment.resolved.${action.action}`, 'Payment', String(payment._id), { reference: payment.reference, note: action.note })
  const fresh = await Payment.findById(payment._id).lean()
  success(res, { ...fresh, id: String(payment._id) }, 'Payment resolved')
}))

/**
 * An order's flags: a refund the platform owes (issued through the provider
 * by hand, or waived), a chargeback reviewed, a late success reviewed. Each
 * is a conditional update on the flag it closes. There is no provider
 * recheck or mark_failed for an order: the settlement sweep and the webhook
 * own its payment status.
 */
async function resolveOrder(req: Request, res: Response, order: { _id: Types.ObjectId; reference: string }, action: ResolveAction) {
  if (action.action !== 'refund_issued' && action.action !== 'refund_waived' && action.action !== 'acknowledge_dispute' && action.action !== 'acknowledge_late_success') {
    error(res, `${action.action} does not apply to a marketplace order`); return
  }
  const resolution = { resolvedBy: req.user!.userId, resolvedAt: new Date(), resolutionNote: action.note }
  const changed = action.action === 'refund_issued' || action.action === 'refund_waived'
    ? await MarketplaceTransaction.updateOne({ _id: order._id, refundStatus: 'required' }, { $set: { refundStatus: action.action === 'refund_issued' ? 'refunded' : 'waived', ...resolution } })
    : action.action === 'acknowledge_dispute'
      ? await MarketplaceTransaction.updateOne({ _id: order._id, status: 'disputed', ...UNACKNOWLEDGED_DISPUTE }, { $set: { disputeAcknowledgedAt: new Date(), ...resolution } })
      : await MarketplaceTransaction.updateOne({ _id: order._id, ...UNACKNOWLEDGED_LATE_SUCCESS }, { $set: { lateSuccessAcknowledgedAt: new Date(), ...resolution } })
  if (!changed.modifiedCount) { error(res, 'Nothing to resolve: the order is not in that state', 409); return }

  void recordAudit(req, `marketplace.resolved.${action.action}`, 'MarketplaceTransaction', String(order._id), { reference: order.reference, note: action.note })
  const fresh = await MarketplaceTransaction.findById(order._id).lean()
  success(res, { ...fresh, id: String(order._id), type: 'order' }, 'Order resolved')
}

export default router

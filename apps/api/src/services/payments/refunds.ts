/**
 * Provider refunds and chargebacks, delivered into the ledger.
 *
 * Paystack refund events carry `data.transaction_reference` — the charge's
 * reference — and no `data.reference`, so the old marketplace handler, which
 * keyed on `reference`, never matched one. Rent, deposit and subscription
 * payments had no refund path at all: a refund left the landlord's credit and
 * the paid subscription in place.
 *
 * Every transition here is a conditional update that records the refund event
 * id in the same write, so a replayed or concurrent delivery applies a refund
 * once. Cumulative refunded amounts decide between refunded and
 * partially_refunded.
 *
 * Deliberately NOT automatic: debiting a landlord for a rent or deposit
 * refund. The landlord may already have withdrawn the credit; the payment is
 * flagged refundRecovery 'required' and an admin is alerted to recover it.
 */
import type { Types } from 'mongoose'
import { MarketplaceTransaction, type IMarketplaceTransaction, type MarketplaceTransactionStatus } from '../../models/MarketplaceTransaction.js'
import { Payment, type IPayment } from '../../models/Payment.js'
import { ServiceBooking } from '../../models/ServiceBooking.js'
import { Sponsorship } from '../../models/Sponsorship.js'
import { AuditLog } from '../../models/AuditLog.js'
import { reverseCommissionsFor } from '../marketplace/affiliate.js'
import { financialAlert } from './alerts.js'
import { round2 } from '../../utils/money.js'
import { logger } from '../../utils/logger.js'

/** The fields of a Paystack event body these handlers read. */
export interface PaystackEventBody {
  event?: string
  data?: Record<string, unknown> & {
    id?: string | number
    reference?: string
    transaction_reference?: string
    refund_reference?: string
    transaction?: { reference?: string; id?: string | number } | string | number
    amount?: number
    currency?: string
    status?: string
    resolution?: string
  }
}

export interface ParsedRefund {
  transactionReference?: string
  refundId?: string
  /** GHS major units. */
  amount: number
  currency?: string
}

/** Paystack speaks pesewas on the wire and names the charge by transaction_reference. */
export function parseRefundEvent(body: PaystackEventBody): ParsedRefund {
  const data = body.data ?? {}
  const transaction = typeof data.transaction === 'object' && data.transaction ? data.transaction : undefined
  const refundId = data.id ?? data.refund_reference
  return {
    transactionReference: data.transaction_reference ?? transaction?.reference,
    refundId: refundId === undefined || refundId === null ? undefined : String(refundId),
    amount: typeof data.amount === 'number' && Number.isSafeInteger(data.amount) && data.amount > 0 ? data.amount / 100 : Number.NaN,
    currency: data.currency,
  }
}

/** Where a dispute names its charge. */
function disputedReference(body: PaystackEventBody): string | undefined {
  const data = body.data ?? {}
  const transaction = typeof data.transaction === 'object' && data.transaction ? data.transaction : undefined
  return transaction?.reference ?? data.transaction_reference ?? data.reference
}

function audit(action: string, entityType: string, entityId: string, userId: string, details: Record<string, unknown>) {
  AuditLog.create({ userId, action, entityType, entityId, details: JSON.stringify(details) })
    .catch((err: Error) => logger.warn(`[Refunds] audit log failed: ${err.message}`))
}

const REFUNDABLE_ORDER: MarketplaceTransactionStatus[] = ['paid', 'partially_refunded', 'disputed']

export type RefundOutcome = 'applied' | 'duplicate' | 'ignored' | 'unmatched'

/**
 * Apply one refund event. Only `refund.processed` moves the ledger; pending,
 * processing and failed refunds are recorded and acknowledged. `eventKey`
 * identifies the delivery when the refund carries no id of its own.
 */
export async function applyRefundEvent(body: PaystackEventBody, eventKey: string): Promise<RefundOutcome> {
  const refund = parseRefundEvent(body)
  if (body.event !== 'refund.processed') {
    logger.info(`[Refunds] ${body.event ?? 'refund event'} for ${refund.transactionReference ?? 'unknown charge'} recorded; no ledger change until processed`)
    return 'ignored'
  }
  if (!refund.transactionReference || !Number.isFinite(refund.amount)) {
    logger.warn('[Refunds] refund.processed without a charge reference or amount; nothing applied')
    return 'ignored'
  }
  if (refund.currency && refund.currency !== 'GHS') {
    financialAlert('refund_currency_unverified', { type: 'Refund', id: refund.transactionReference }, { currency: refund.currency, amount: refund.amount })
    return 'ignored'
  }
  const key = `refund:${refund.refundId ?? eventKey}`

  const transaction = await MarketplaceTransaction.findOne({ reference: refund.transactionReference }).lean()
  if (transaction) return applyOrderRefund(transaction, refund.amount, key)
  const payment = await Payment.findOne({ reference: refund.transactionReference }).lean()
  if (payment) return applyPaymentRefund(payment, refund.amount, key)
  logger.warn(`[Refunds] refund for ${refund.transactionReference} matched no order and no payment`)
  return 'unmatched'
}

/** The pipeline stage that adds a refund to the cumulative total and records its key, in one write. */
function accumulate(amount: number, key: string) {
  return {
    $set: {
      refundedAmount: { $round: [{ $add: [{ $ifNull: ['$refundedAmount', 0] }, amount] }, 2] },
      refundEventIds: { $concatArrays: [{ $ifNull: ['$refundEventIds', []] }, [{ $literal: key }]] },
    },
  }
}

async function applyOrderRefund(transaction: Pick<IMarketplaceTransaction, 'reference' | 'grossAmount' | 'discountAmount' | 'bookingId' | 'sponsorshipId' | 'buyerId'> & { _id: Types.ObjectId }, amount: number, key: string): Promise<RefundOutcome> {
  const owed = round2(transaction.grossAmount - transaction.discountAmount)
  const updated = await MarketplaceTransaction.findOneAndUpdate(
    { _id: transaction._id, status: { $in: REFUNDABLE_ORDER }, refundEventIds: { $ne: key } },
    [
      accumulate(amount, key),
      { $set: { status: { $cond: [{ $gte: ['$refundedAmount', owed - 0.005] }, 'refunded', 'partially_refunded'] } } },
    ],
    { returnDocument: 'after', updatePipeline: true },
  ).lean() as unknown as IMarketplaceTransaction | null
  if (!updated) return 'duplicate'
  audit(`marketplace.${updated.status}`, 'MarketplaceTransaction', String(transaction._id), transaction.buyerId ?? 'system', { reference: transaction.reference, amount, refundedAmount: updated.refundedAmount })

  if (updated.status !== 'refunded') {
    financialAlert('marketplace_partial_refund', { type: 'MarketplaceTransaction', id: String(transaction._id) }, { reference: transaction.reference, refundedAmount: updated.refundedAmount, owed })
    return 'applied'
  }
  // A refund the platform owed (a duplicate charge) is now settled.
  if (updated.refundStatus === 'required') {
    await MarketplaceTransaction.updateOne({ _id: transaction._id, refundStatus: 'required' }, { $set: { refundStatus: 'refunded' } })
  }
  // The order is no longer paid for: the worker must not treat it as settled,
  // the campaign must stop serving, and affiliates earn nothing on it.
  if (transaction.bookingId) {
    await ServiceBooking.updateOne({ _id: transaction.bookingId, paymentStatus: 'paid' }, { $set: { paymentStatus: 'refunded' } })
  }
  if (transaction.sponsorshipId) {
    await Sponsorship.updateOne({ _id: transaction.sponsorshipId, status: { $in: ['active', 'pending_payment'] } }, { $set: { status: 'paused', pausedReason: 'Payment refunded' } })
  }
  await reverseCommissionsFor(transaction.reference, 'Source payment refunded')
  logger.info(`[Refunds] ${transaction.reference} refunded in full (${updated.refundedAmount} GHS)`)
  return 'applied'
}

async function applyPaymentRefund(payment: IPayment & { _id: Types.ObjectId }, amount: number, key: string): Promise<RefundOutcome> {
  if (payment.status !== 'completed') {
    // A refund of a payment we never saw complete is a reconciliation question, not a ledger entry.
    if (payment.status !== 'refunded') financialAlert('refund_on_unsettled_payment', { type: 'Payment', id: String(payment._id) }, { reference: payment.reference, status: payment.status, amount })
    return payment.status === 'refunded' ? 'duplicate' : 'ignored'
  }
  const updated = await Payment.findOneAndUpdate(
    { _id: payment._id, status: 'completed', refundEventIds: { $ne: key } },
    [
      accumulate(amount, key),
      { $set: { status: { $cond: [{ $gte: ['$refundedAmount', { $subtract: ['$amount', 0.005] }] }, 'refunded', 'completed'] }, refundedAt: '$$NOW' } },
    ],
    { returnDocument: 'after', updatePipeline: true },
  ).lean() as unknown as IPayment | null
  if (!updated) return 'duplicate'
  audit(updated.status === 'refunded' ? 'payment.refunded' : 'payment.partially_refunded', 'Payment', String(payment._id), payment.tenantId, { reference: payment.reference, amount, refundedAmount: updated.refundedAmount })

  if (updated.refundStatus === 'required' && updated.status === 'refunded') {
    await Payment.updateOne({ _id: payment._id, refundStatus: 'required' }, { $set: { refundStatus: 'refunded' } })
  }
  // Rent and deposits credited a wallet. Recovering that credit is manual.
  if (updated.walletCreditIntent) {
    const recoverable = round2(Math.min(updated.refundedAmount ?? amount, updated.walletCreditIntent.amount))
    await Payment.updateOne({ _id: payment._id }, { $set: { refundRecovery: 'required', refundRecoveryAmount: recoverable } })
    financialAlert('payment_refund_recovery_required', { type: 'Payment', id: String(payment._id) }, {
      reference: payment.reference, purpose: payment.purpose, beneficiaryId: updated.walletCreditIntent.userId, recoverable,
    })
  }
  // A subscription's access follows its payment: currentPaidSubscription only
  // honours a 'completed' payment, so a full refund ends it with no extra write.
  return 'applied'
}

export type DisputeOutcome = 'applied' | 'ignored' | 'unmatched'

/**
 * charge.dispute.create / .remind hold the charge; charge.dispute.resolve
 * restores it. A dispute the merchant loses is followed by its own refund
 * event, which is what moves money.
 */
export async function applyDisputeEvent(body: PaystackEventBody): Promise<DisputeOutcome> {
  const reference = disputedReference(body)
  if (!reference) return 'ignored'
  const opening = body.event === 'charge.dispute.create' || body.event === 'charge.dispute.remind'
  const closing = body.event === 'charge.dispute.resolve'
  if (!opening && !closing) return 'ignored'
  const resolution = typeof body.data?.resolution === 'string' ? body.data.resolution : undefined

  const transaction = await MarketplaceTransaction.findOne({ reference }).select('_id reference').lean()
  if (transaction) {
    const moved = opening
      ? await MarketplaceTransaction.updateOne(
        { _id: transaction._id, status: { $in: ['paid', 'partially_refunded'] } },
        [{ $set: { preDisputeStatus: '$status', status: 'disputed', disputedAt: '$$NOW' } }],
        { updatePipeline: true },
      )
      : await MarketplaceTransaction.updateOne(
        { _id: transaction._id, status: 'disputed' },
        [{ $set: { status: { $ifNull: ['$preDisputeStatus', 'paid'] } } }, { $unset: 'preDisputeStatus' }],
        { updatePipeline: true },
      )
    if (moved.modifiedCount && opening) financialAlert('marketplace_dispute_opened', { type: 'MarketplaceTransaction', id: String(transaction._id) }, { reference })
    if (moved.modifiedCount && closing) audit('marketplace.dispute_resolved', 'MarketplaceTransaction', String(transaction._id), 'system', { reference, resolution })
    return 'applied'
  }

  const payment = await Payment.findOne({ reference }).select('_id reference tenantId').lean()
  if (!payment) return 'unmatched'
  const moved = opening
    ? await Payment.updateOne({ _id: payment._id, status: { $in: ['completed', 'refunded'] }, disputeStatus: { $ne: 'open' } }, { $set: { disputeStatus: 'open', disputedAt: new Date() }, $unset: { disputeResolvedAt: 1, disputeResolution: 1 } })
    : await Payment.updateOne({ _id: payment._id, disputeStatus: 'open' }, { $set: { disputeStatus: 'resolved', disputeResolvedAt: new Date(), ...(resolution ? { disputeResolution: resolution } : {}) } })
  if (moved.modifiedCount && opening) financialAlert('payment_dispute_opened', { type: 'Payment', id: String(payment._id) }, { reference })
  if (moved.modifiedCount && closing) audit('payment.dispute_resolved', 'Payment', String(payment._id), payment.tenantId, { reference, resolution })
  return 'applied'
}

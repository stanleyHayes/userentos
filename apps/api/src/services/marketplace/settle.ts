/**
 * Applying a successful charge to a transaction — the ONE implementation.
 *
 * Three paths conclude a marketplace payment: the Paystack webhook, the
 * reconciliation sweep, and GET /verify/:reference, which a client polls after
 * checkout. They had drifted: the webhook re-verified server-side, compared the
 * provider's amount against what was owed, set settlementStatus and logged.
 * /verify just set status = 'paid'.
 *
 * So a charge the webhook would have REFUSED for an amount mismatch could be
 * accepted by polling /verify instead, crediting the seller the full expected
 * amount against a smaller payment. Whichever path runs first now applies the
 * same rules.
 *
 * "The provider says this reference succeeded for this amount" is not enough on
 * its own. Rent, wallet deposits and marketplace orders share one Paystack
 * account, so a reference that succeeded somewhere else must not settle an
 * order: a client-chosen reference once let a buyer point an order at their own
 * wallet deposit of the same amount and have the order marked paid. A charge
 * now settles a transaction only if the row is still awaiting payment, the
 * charge was taken in GHS against this exact reference, and it carries this
 * transaction's id in the metadata the server sent when it initialized it.
 *
 * One exception to "still awaiting payment": a checkout we closed (failed)
 * can still be paid. The buyer may finish on the Paystack page they already
 * had open after the checkout was closed as abandoned or expired, or retry a
 * failed card on it. That charge is a late success: the row moves failed to
 * paid once, an admin is alerted, and the order is settled by the same rules
 * as any other charge, so an order already paid another way flags this charge
 * for refund instead.
 */
import type { Types } from 'mongoose'
import { Sponsorship } from '../../models/Sponsorship.js'
import { ServiceBooking } from '../../models/ServiceBooking.js'
import { MarketplaceTransaction } from '../../models/MarketplaceTransaction.js'
import { redeemForTransaction } from './coupons.js'
import { financialAlert } from '../payments/alerts.js'
import { logger } from '../../utils/logger.js'
import type { IMarketplaceTransaction, MarketplaceTransactionStatus } from '../../models/MarketplaceTransaction.js'

/** What the provider told us, after a server-side verification. */
export interface VerifiedCharge {
  status: string
  amount: number
  currency?: string
  reference?: string
  fees?: number
  metadata?: Record<string, unknown>
}

export type RefusalReason =
  | 'not_successful' | 'amount_mismatch' | 'already_paid' | 'not_settleable'
  | 'currency_mismatch' | 'reference_mismatch' | 'binding_mismatch'

export type SettleOutcome =
  | { applied: true }
  | { applied: false; reason: RefusalReason }

/** Only a row still waiting on the provider can be paid, bar a late success on a failed one. */
export const SETTLEABLE_STATUSES = ['initialized', 'pending'] as const

/** Statuses in which a transaction has taken the buyer's money for its order. */
export const PAID_STATUSES: MarketplaceTransactionStatus[] = ['paid', 'partially_refunded', 'disputed']

/** Metadata key carrying our transaction id through the provider and back. */
export const BINDING_KEY = 'rentosTransactionId'

/** References this service generates. An unbound legacy row must carry one. */
const SERVER_REFERENCE = /^(MKT|SPN)-/

/** Tolerance for the provider's rounding on each leg. */
const AMOUNT_TOLERANCE = 0.01

export type SettleSubject =
  Pick<IMarketplaceTransaction, 'reference' | 'status' | 'currency' | 'grossAmount' | 'discountAmount' | 'providerBound'>
  & { _id: unknown }

/** Why this verified charge may not settle this transaction, or null when it may. */
export function chargeRefusal(transaction: SettleSubject, verified: VerifiedCharge): RefusalReason | null {
  if (verified.status !== 'success') return 'not_successful'
  if (transaction.status === 'paid') return 'already_paid'
  if (!(SETTLEABLE_STATUSES as readonly string[]).includes(transaction.status)) return 'not_settleable'
  return chargeMismatch(transaction, verified)
}

/**
 * chargeRefusal, except that a closed ('failed') checkout may take a late
 * success. The charge must still be this row's own: the same reference, GHS,
 * the binding and the amount owed.
 */
export function settleRefusal(transaction: SettleSubject, verified: VerifiedCharge): RefusalReason | null {
  if (transaction.status === 'failed' && verified.status === 'success') return chargeMismatch(transaction, verified)
  return chargeRefusal(transaction, verified)
}

/** Why the charge's own facts do not match this transaction, whatever its status. */
function chargeMismatch(transaction: SettleSubject, verified: VerifiedCharge): RefusalReason | null {
  if (verified.reference !== transaction.reference) return 'reference_mismatch'
  if (verified.currency !== 'GHS' || (transaction.currency ?? 'GHS') !== 'GHS') return 'currency_mismatch'

  if (transaction.providerBound) {
    if (String(verified.metadata?.[BINDING_KEY] ?? '') !== String(transaction._id)) return 'binding_mismatch'
  } else if (!SERVER_REFERENCE.test(transaction.reference)) {
    // Rows from before the binding: only a reference this service generated
    // can be trusted not to name a charge that belongs to something else.
    return 'binding_mismatch'
  }

  // What the buyer actually owed. Never take the provider's word for the
  // amount without checking it against our own arithmetic.
  const expected = transaction.grossAmount - transaction.discountAmount
  if (Math.abs(verified.amount - expected) > AMOUNT_TOLERANCE) return 'amount_mismatch'
  return null
}

export async function applySuccessfulCharge(
  transaction: IMarketplaceTransaction,
  verified: VerifiedCharge,
  source: 'webhook' | 'verify' | 'reconcile',
): Promise<SettleOutcome> {
  const refusal = settleRefusal(transaction, verified)
  if (refusal) {
    if (refusal !== 'already_paid') {
      logger.error(
        `[${source}] refusing to settle ${transaction.reference}: ${refusal} (provider ${verified.status}, ${verified.amount} ${verified.currency ?? 'no currency'})`,
      )
    }
    return { applied: false, reason: refusal }
  }

  // Conditional on the status the checks above saw, so a webhook and a /verify
  // poll racing each other settle the order exactly once. The checkout is
  // closed in the same write, freeing the order's open-checkout slot. A late
  // success moves failed to paid, once.
  const verifiedAt = new Date()
  const transition = (late: boolean) => MarketplaceTransaction.findOneAndUpdate(
    late ? { _id: transaction._id, status: 'failed', lateSuccessAt: { $exists: false } } : { _id: transaction._id, status: { $in: SETTLEABLE_STATUSES } },
    {
      $set: { status: 'paid', verifiedAt, processorFeeAmount: verified.fees, settlementStatus: 'pending', ...(late ? { lateSuccessAt: verifiedAt } : {}) },
      $unset: { openOrderKey: 1, ...(late ? { failureReason: 1 } : {}) },
    },
    { returnDocument: 'after' },
  )
  let late = transaction.status === 'failed'
  let settled = await transition(late)
  if (!settled && !late) {
    // Closed as abandoned or expired while this success was on its way.
    settled = await transition(true)
    late = !!settled
  }
  if (!settled) return { applied: false, reason: 'already_paid' }
  const previousFailureReason = late ? transaction.failureReason : undefined
  // Keep the caller's copy in step: the routes answer from it.
  transaction.status = 'paid'
  transaction.verifiedAt = settled.verifiedAt
  transaction.processorFeeAmount = verified.fees
  transaction.settlementStatus = 'pending'
  if (late) {
    transaction.lateSuccessAt = settled.lateSuccessAt
    transaction.failureReason = undefined
    financialAlert('marketplace_late_success', { type: 'MarketplaceTransaction', id: String(transaction._id) }, {
      reference: transaction.reference, previousFailureReason, bookingId: transaction.bookingId, sponsorshipId: transaction.sponsorshipId, source,
    })
  }

  await settleOrder(transaction, source)
  logger.info(`[${source}] ${transaction.reference} paid${late ? ' (late success)' : ''} — platform fee ${transaction.platformFeeAmount}`)
  return { applied: true }
}

/** Mark the order this charge paid for as paid, or flag the charge for refund when the order was not waiting for it. */
async function settleOrder(transaction: IMarketplaceTransaction, source: string): Promise<void> {
  // A campaign is created 'pending_payment' and only serving status 'active'
  // is ever shown, so this is what makes a bought sponsorship actually run.
  // Guarded on the current status so a replay cannot revive one an admin has
  // since paused or cancelled.
  if (transaction.sponsorshipId) {
    const activated = await Sponsorship.findOneAndUpdate(
      { _id: transaction.sponsorshipId, status: 'pending_payment' },
      { $set: { status: 'active' } },
      { returnDocument: 'after' },
    )
    if (activated) logger.info(`[${source}] sponsorship ${transaction.sponsorshipId} activated by ${transaction.reference}`)
    else await flagRefundRequired(transaction, { sponsorshipId: transaction.sponsorshipId }, source)
  }

  /*
   * Mark the order paid too.
   *
   * Without this the money lands and the booking still reads
   * paymentStatus: 'pending', so the worker chases a payment that already
   * settled and the buyer could be charged twice. Guarded on the current
   * status so a replayed event cannot overwrite a later correction.
   */
  if (transaction.bookingId) {
    const settledBooking = await ServiceBooking.findOneAndUpdate(
      { _id: transaction.bookingId, paymentStatus: { $ne: 'paid' } },
      { $set: { paymentStatus: 'paid', paymentAmount: transaction.grossAmount - transaction.discountAmount } },
      { returnDocument: 'after' },
    )
    if (settledBooking) logger.info(`[${source}] booking ${transaction.bookingId} marked paid by ${transaction.reference}`)
    else await flagRefundRequired(transaction, { bookingId: transaction.bookingId }, source)
  }

  // The coupon's use is recorded here and nowhere else — once, because only
  // the caller that won the paid transition reaches this line. The payment
  // is already final, so a failure here is logged, never thrown.
  if (transaction.couponCode && transaction.discountAmount > 0) {
    try {
      const coupon = await redeemForTransaction(transaction)
      if (!coupon.redeemed) logger.error(`[${source}] coupon ${transaction.couponCode} on ${transaction.reference} not counted: ${coupon.reason}`)
    } catch (err) {
      logger.error(`[${source}] coupon redemption failed for ${transaction.reference}: ${(err as Error).message}`)
    }
  }
}

/**
 * A verified charge for an order that was not waiting for it: another
 * transaction had already paid it (the buyer paid twice), the worker marked
 * the booking paid in cash, or the campaign was no longer awaiting payment
 * (cancelled, expired or already running). The money is real, so this
 * transaction stays paid, but it is flagged refundStatus 'required' for an
 * admin to refund through the provider — never automatically — and the order
 * itself is left as it was. duplicateOf names the earlier transaction when
 * there is one. Best-effort, like the coupon count: the payment is final.
 */
async function flagRefundRequired(transaction: IMarketplaceTransaction, order: { bookingId?: string; sponsorshipId?: string }, source: string): Promise<void> {
  try {
    const earlier = await MarketplaceTransaction.findOne(
      { ...order, _id: { $ne: transaction._id as Types.ObjectId }, status: { $in: PAID_STATUSES } },
      { reference: 1 },
      { sort: { verifiedAt: 1 } },
    ).lean()
    const refundReason = earlier
      ? `Order already paid by ${earlier.reference}`
      : `${order.bookingId ? 'Booking' : 'Campaign'} was no longer awaiting payment`
    const flagged = await MarketplaceTransaction.updateOne(
      { _id: transaction._id, refundStatus: { $exists: false } },
      { $set: { refundStatus: 'required', refundReason, ...(earlier ? { duplicateOf: earlier.reference } : {}) } },
    )
    if (flagged.modifiedCount) {
      financialAlert(earlier ? 'marketplace_duplicate_charge' : 'marketplace_order_already_settled', { type: 'MarketplaceTransaction', id: String(transaction._id) }, {
        reference: transaction.reference, refundReason, ...(earlier ? { duplicateOf: earlier.reference } : {}), ...order, source,
      })
    }
  } catch (err) {
    logger.error(`[${source}] refund check failed for ${transaction.reference}: ${(err as Error).message}`)
  }
}

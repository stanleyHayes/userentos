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
 */
import { Sponsorship } from '../../models/Sponsorship.js'
import { ServiceBooking } from '../../models/ServiceBooking.js'
import { MarketplaceTransaction } from '../../models/MarketplaceTransaction.js'
import { redeemForTransaction } from './coupons.js'
import { logger } from '../../utils/logger.js'
import type { IMarketplaceTransaction } from '../../models/MarketplaceTransaction.js'

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

/** Only a row still waiting on the provider can be paid. A failed row stays failed. */
export const SETTLEABLE_STATUSES = ['initialized', 'pending'] as const

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
  const refusal = chargeRefusal(transaction, verified)
  if (refusal) {
    if (refusal !== 'already_paid') {
      logger.error(
        `[${source}] refusing to settle ${transaction.reference}: ${refusal} (provider ${verified.status}, ${verified.amount} ${verified.currency ?? 'no currency'})`,
      )
    }
    return { applied: false, reason: refusal }
  }

  // Conditional on the status the checks above saw, so a webhook and a /verify
  // poll racing each other settle the order exactly once.
  const settled = await MarketplaceTransaction.findOneAndUpdate(
    { _id: transaction._id, status: { $in: SETTLEABLE_STATUSES } },
    { $set: { status: 'paid', verifiedAt: new Date(), processorFeeAmount: verified.fees, settlementStatus: 'pending' } },
    { returnDocument: 'after' },
  )
  if (!settled) return { applied: false, reason: 'already_paid' }
  // Keep the caller's copy in step: the routes answer from it.
  transaction.status = 'paid'
  transaction.verifiedAt = settled.verifiedAt
  transaction.processorFeeAmount = verified.fees
  transaction.settlementStatus = 'pending'

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
  }

  // The coupon's use is recorded here and nowhere else — once, because only
  // the caller that won the paid transition above reaches this line. The
  // payment is already final, so a failure here is logged, never thrown.
  if (transaction.couponCode && transaction.discountAmount > 0) {
    try {
      const coupon = await redeemForTransaction(transaction)
      if (!coupon.redeemed) logger.error(`[${source}] coupon ${transaction.couponCode} on ${transaction.reference} not counted: ${coupon.reason}`)
    } catch (err) {
      logger.error(`[${source}] coupon redemption failed for ${transaction.reference}: ${(err as Error).message}`)
    }
  }

  logger.info(`[${source}] ${transaction.reference} paid — platform fee ${transaction.platformFeeAmount}`)
  return { applied: true }
}

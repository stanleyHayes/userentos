/**
 * Applying a successful charge to a transaction — the ONE implementation.
 *
 * Two paths conclude a marketplace payment: the Paystack webhook and
 * GET /verify/:reference, which a client polls after checkout. They had
 * drifted: the webhook re-verified server-side, compared the provider's amount
 * against what was owed, set settlementStatus and logged. /verify just set
 * status = 'paid'.
 *
 * So a charge the webhook would have REFUSED for an amount mismatch could be
 * accepted by polling /verify instead, crediting the seller the full expected
 * amount against a smaller payment. Whichever path runs first now applies the
 * same rules.
 */
import { Sponsorship } from '../../models/Sponsorship.js'
import { logger } from '../../utils/logger.js'
import type { IMarketplaceTransaction } from '../../models/MarketplaceTransaction.js'

/** What the provider told us, after a server-side verification. */
export interface VerifiedCharge {
  status: string
  amount: number
  fees?: number
}

export type SettleOutcome =
  | { applied: true }
  | { applied: false; reason: 'not_successful' | 'amount_mismatch' | 'already_paid' }

/** Tolerance for the provider's rounding on each leg. */
const AMOUNT_TOLERANCE = 0.01

export async function applySuccessfulCharge(
  transaction: IMarketplaceTransaction,
  verified: VerifiedCharge,
  source: 'webhook' | 'verify',
): Promise<SettleOutcome> {
  if (verified.status !== 'success') {
    logger.error(`[${source}] ${transaction.reference} is not successful: ${verified.status}`)
    return { applied: false, reason: 'not_successful' }
  }

  if (transaction.status === 'paid') return { applied: false, reason: 'already_paid' }

  // What the buyer actually owed. Never take the provider's word for the
  // amount without checking it against our own arithmetic.
  const expected = transaction.grossAmount - transaction.discountAmount
  if (Math.abs(verified.amount - expected) > AMOUNT_TOLERANCE) {
    logger.error(
      `[${source}] CRITICAL amount mismatch on ${transaction.reference}: expected ${expected}, provider says ${verified.amount}`,
    )
    return { applied: false, reason: 'amount_mismatch' }
  }

  transaction.status = 'paid'
  transaction.verifiedAt = new Date()
  transaction.processorFeeAmount = verified.fees
  transaction.settlementStatus = 'pending'
  await transaction.save()

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

  logger.info(`[${source}] ${transaction.reference} paid — platform fee ${transaction.platformFeeAmount}`)
  return { applied: true }
}

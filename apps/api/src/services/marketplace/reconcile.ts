/**
 * Webhook dead-letter retry and settlement reconciliation (spec §8.4).
 *
 * The spec asks for two things the happy path cannot provide:
 *
 *  - "Add retry/dead-letter handling for failed webhook processing." Stored
 *    events that were never marked processed are re-dispatched through the
 *    same Paystack event dispatcher the webhook uses, for every event family
 *    (services/payments/paystackEvents.ts).
 *  - "Reconcile successful transactions against Paystack settlement
 *    information." A webhook that never arrives at all leaves a paid
 *    transaction stuck at `pending` with no other route to the truth.
 *
 * Both work by asking the provider, never by trusting stored state.
 *
 * The settlement sweep checks each open checkout on a backoff, earliest due
 * first. It used to take the 50 oldest open rows every run and only resolve
 * success or failure, so once 50 abandoned checkouts existed, a newer paid one
 * whose webhook was missed was never looked at. Checkouts Paystack reports as
 * abandoned, or has no record of, are now closed once they are a day old.
 */
import type { Types } from 'mongoose'
import { MarketplaceTransaction, type IMarketplaceTransaction } from '../../models/MarketplaceTransaction.js'
import { verifyTransaction, TransactionNotFoundError, type VerifiedTransaction } from './paystack.js'
import { applySuccessfulCharge, chargeRefusal, SETTLEABLE_STATUSES } from './settle.js'
import { reconcileBackoffMs } from '../payouts/reconcile.js'
import { logger } from '../../utils/logger.js'

export { retryUnprocessedWebhooks, MAX_WEBHOOK_ATTEMPTS, type SweepResult } from '../payments/paystackEvents.js'

/** An abandoned or unknown checkout is closed once it is this old. */
export const ABANDONED_AFTER_MS = 24 * 60 * 60_000

export type CheckoutOutcome = 'paid' | 'closed' | 'open'

/** Close a checkout that will never be paid, conditionally, freeing its order for a new one. */
async function closeCheckout(transaction: Pick<IMarketplaceTransaction, 'reference'> & { _id: Types.ObjectId }, reason: 'failed' | 'abandoned' | 'expired'): Promise<boolean> {
  const closed = await MarketplaceTransaction.updateOne(
    { _id: transaction._id, status: { $in: SETTLEABLE_STATUSES } },
    { $set: { status: 'failed', failureReason: reason }, $unset: { openOrderKey: 1 } },
  )
  if (closed.modifiedCount) logger.info(`[Reconcile] ${transaction.reference} closed: ${reason}`)
  return closed.modifiedCount > 0
}

/**
 * Settle a verified success through the shared rules. The same rules as the
 * webhook and /verify: a FAILED row whose reference succeeded somewhere else
 * on the shared Paystack account — a wallet deposit — must never be marked
 * paid here.
 */
async function applyPaidCharge(transaction: IMarketplaceTransaction, verified: VerifiedTransaction): Promise<boolean> {
  const refusal = chargeRefusal(transaction, verified)
  if (refusal) {
    if (refusal !== 'already_paid' && refusal !== 'not_settleable') {
      logger.error(`[Reconcile] refusing to settle ${transaction.reference}: ${refusal} (provider ${verified.amount} ${verified.currency ?? ''})`)
    }
    return false
  }
  const eventId = `reconcile:${transaction.reference}`
  const claimed = await MarketplaceTransaction.findOneAndUpdate(
    { _id: transaction._id, status: { $in: SETTLEABLE_STATUSES }, processedEventIds: { $ne: eventId } },
    { $addToSet: { processedEventIds: eventId } },
    { returnDocument: 'after' },
  )
  if (!claimed) return false
  const outcome = await applySuccessfulCharge(claimed, verified, 'reconcile')
  if (outcome.applied) logger.info(`[Reconcile] Recovered ${transaction.reference} — marked paid from provider verification`)
  return outcome.applied
}

/**
 * Bring one open checkout in line with the provider. `abandonAfterMs` is how
 * old a checkout must be before "abandoned" or "no such transaction" closes it.
 */
export async function reconcileCheckout(transaction: IMarketplaceTransaction, opts: { now?: Date; abandonAfterMs?: number } = {}): Promise<CheckoutOutcome> {
  const { now = new Date(), abandonAfterMs = ABANDONED_AFTER_MS } = opts
  const old = now.getTime() - new Date(transaction.createdAt).getTime() >= abandonAfterMs
  let verified: VerifiedTransaction
  try {
    verified = await verifyTransaction(transaction.reference)
  } catch (err) {
    // An outage says nothing; only an explicit "not found" is an answer.
    if (err instanceof TransactionNotFoundError) return old && await closeCheckout(transaction as IMarketplaceTransaction & { _id: Types.ObjectId }, 'expired') ? 'closed' : 'open'
    throw err
  }
  const status = (verified.status ?? '').toLowerCase()
  if (status === 'success') return await applyPaidCharge(transaction, verified) ? 'paid' : 'open'
  if (status === 'failed' || status === 'reversed') return await closeCheckout(transaction as IMarketplaceTransaction & { _id: Types.ObjectId }, 'failed') ? 'closed' : 'open'
  if (status === 'abandoned' && old) return await closeCheckout(transaction as IMarketplaceTransaction & { _id: Types.ObjectId }, 'abandoned') ? 'closed' : 'open'
  return 'open'
}

export interface ReconcileResult { examined: number; corrected: number }

/**
 * Catch transactions whose webhook never arrived.
 *
 * Only looks at transactions old enough that a webhook should already have
 * landed; anything younger is still legitimately in flight. Each row is
 * claimed (its next check pushed out by the backoff) before the provider is
 * asked, so overlapping runs never double up. `scope` narrows the sweep
 * (tests share a database).
 */
export async function reconcilePendingTransactions(
  olderThanMinutes = 30,
  limit = 50,
  opts: { now?: Date; scope?: Record<string, unknown> } = {},
): Promise<ReconcileResult> {
  const { now = new Date(), scope = {} } = opts
  const due: Record<string, unknown> = {
    ...scope,
    status: { $in: SETTLEABLE_STATUSES },
    createdAt: { $lt: new Date(now.getTime() - olderThanMinutes * 60_000) },
    $or: [{ nextReconcileAt: { $exists: false } }, { nextReconcileAt: { $lte: now } }],
  }
  const candidates = await MarketplaceTransaction.find(due).sort({ nextReconcileAt: 1, createdAt: 1 }).limit(limit).select('_id reconcileAttempts').lean()

  let examined = 0
  let corrected = 0
  for (const candidate of candidates) {
    const claimed = await MarketplaceTransaction.findOneAndUpdate(
      { ...due, _id: candidate._id },
      { $set: { lastReconcileAt: now, nextReconcileAt: new Date(now.getTime() + reconcileBackoffMs(candidate.reconcileAttempts ?? 0)) }, $inc: { reconcileAttempts: 1 } },
      { returnDocument: 'after' },
    )
    if (!claimed) continue
    examined++
    try {
      if (await reconcileCheckout(claimed, { now }) !== 'open') corrected++
    } catch (err) {
      // A provider outage must not abort the whole sweep.
      logger.warn(`[Reconcile] Could not verify ${claimed.reference}: ${(err as Error).message}`)
    }
  }

  return { examined, corrected }
}

/**
 * Webhook dead-letter retry and settlement reconciliation (spec §8.4).
 *
 * The spec asks for two things the happy path cannot provide:
 *
 *  - "Add retry/dead-letter handling for failed webhook processing." A stored
 *    event previously looked identical whether it had been applied, failed
 *    halfway, or been skipped, so a transient failure (a provider timeout
 *    during re-verification) silently lost the payment forever.
 *  - "Reconcile successful transactions against Paystack settlement
 *    information." A webhook that never arrives at all leaves a paid
 *    transaction stuck at `pending` with no other route to the truth.
 *
 * Both work by asking the provider, never by trusting stored state.
 */
import { WebhookEvent } from '../../models/WebhookEvent.js'
import { MarketplaceTransaction } from '../../models/MarketplaceTransaction.js'
import { verifyTransaction } from './paystack.js'
import { logger } from '../../utils/logger.js'

/** Give up after this many attempts; the row stays for a human to inspect. */
export const MAX_WEBHOOK_ATTEMPTS = 5

export interface SweepResult { examined: number; recovered: number; exhausted: number }

/**
 * Retry events that were stored but never applied.
 *
 * Selection is "has no processedAt and has attempts left" rather than a status
 * column, so an event that failed *before* any bookkeeping ran is still picked
 * up — that is exactly the case a status column would miss.
 */
export async function retryUnprocessedWebhooks(limit = 50): Promise<SweepResult> {
  const stale = await WebhookEvent.find({
    provider: 'paystack',
    processedAt: { $exists: false },
    attempts: { $lt: MAX_WEBHOOK_ATTEMPTS },
    reference: { $exists: true, $ne: null },
  }).sort({ createdAt: 1 }).limit(limit)

  let recovered = 0
  let exhausted = 0

  for (const event of stale) {
    event.attempts = (event.attempts ?? 0) + 1
    try {
      const applied = await applyPaidEvent(event.reference as string, event.eventId)
      if (applied) recovered++
      event.processedAt = new Date()
      event.processingError = undefined
    } catch (err) {
      event.processingError = (err as Error).message
      if (event.attempts >= MAX_WEBHOOK_ATTEMPTS) {
        exhausted++
        logger.error(
          `[Reconcile] Webhook ${event.eventId} (${event.reference}) exhausted ${MAX_WEBHOOK_ATTEMPTS} attempts: ${event.processingError}`,
        )
      }
    }
    await event.save()
  }

  return { examined: stale.length, recovered, exhausted }
}

/**
 * Bring one transaction in line with the provider.
 *
 * Shared by the retry sweep and the reconciliation job so there is a single
 * definition of "what does paid mean", and it is always the provider's answer.
 * Idempotent: the event id is claimed in a conditional update, so a retry
 * cannot apply the same event twice.
 */
async function applyPaidEvent(reference: string, eventId: string): Promise<boolean> {
  const verified = await verifyTransaction(reference)
  if (verified.status !== 'success') return false

  const transaction = await MarketplaceTransaction.findOne({ reference })
  if (!transaction) return false
  if (transaction.status === 'paid') return false

  const expected = transaction.grossAmount - transaction.discountAmount
  if (Math.abs(verified.amount - expected) > 0.01) {
    throw new Error(
      `amount mismatch on ${reference}: expected ${expected}, provider reported ${verified.amount}`,
    )
  }

  const claimed = await MarketplaceTransaction.findOneAndUpdate(
    { _id: transaction._id, status: { $ne: 'paid' }, processedEventIds: { $ne: eventId } },
    {
      $set: { status: 'paid', verifiedAt: new Date(), processorFeeAmount: verified.fees, settlementStatus: 'pending' },
      $addToSet: { processedEventIds: eventId },
    },
    { returnDocument: 'after' },
  )
  if (!claimed) return false

  logger.info(`[Reconcile] Recovered ${reference} — marked paid from a replayed webhook`)
  return true
}

export interface ReconcileResult { examined: number; corrected: number }

/**
 * Catch transactions whose webhook never arrived.
 *
 * Only looks at transactions old enough that a webhook should already have
 * landed; anything younger is still legitimately in flight.
 */
export async function reconcilePendingTransactions(
  olderThanMinutes = 30,
  limit = 50,
): Promise<ReconcileResult> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000)

  const pending = await MarketplaceTransaction.find({
    status: { $in: ['initialized', 'pending'] },
    createdAt: { $lt: cutoff },
  }).sort({ createdAt: 1 }).limit(limit)

  let corrected = 0
  for (const transaction of pending) {
    try {
      const verified = await verifyTransaction(transaction.reference)
      if (verified.status === 'success') {
        const applied = await applyPaidEvent(transaction.reference, `reconcile:${transaction.reference}`)
        if (applied) corrected++
      } else if (verified.status === 'failed') {
        transaction.status = 'failed'
        await transaction.save()
        corrected++
      }
    } catch (err) {
      // A provider outage must not abort the whole sweep.
      logger.warn(`[Reconcile] Could not verify ${transaction.reference}: ${(err as Error).message}`)
    }
  }

  return { examined: pending.length, corrected }
}

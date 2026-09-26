/**
 * Catch rent, deposit and subscription payments whose webhook never arrived.
 *
 * Every non-terminal payment older than a couple of minutes is asked about
 * by its correlator — saved before initiation, so a crash or timeout mid-call
 * still leaves something to ask — on a per-payment backoff, earliest due
 * first, so a pile of held payments cannot starve a fresh one.
 *
 * The provider's answer goes through the same finalizer as a webhook. Two
 * answers need care:
 *  - "no such charge": only after 30 minutes is it believed, and the payment
 *    fails as never_reached_provider, freeing the obligation for a new
 *    checkout. Before that Paystack may simply not have indexed it yet.
 *  - Paystack's 'abandoned' is not final while the payer may still approve
 *    the prompt, so it only fails a payment after the same 30 minutes.
 */
import { Payment, type IPayment } from '../../models/Payment.js'
import { getProvider } from './index.js'
import { finalizePayment } from './finalize.js'
import { checkCollection } from './reconciliationEvidence.js'
import { reconcileBackoffMs } from '../payouts/reconcile.js'
import { logger } from '../../utils/logger.js'
import type { ProviderId } from './types.js'

/** Younger than this a payment is still legitimately in flight. */
export const RECONCILE_MIN_AGE_MS = 2 * 60_000
/** How long "not found" or "abandoned" must persist before a payment is failed on it. */
export const NOT_REACHED_FAIL_AFTER_MS = 30 * 60_000

export type PaymentReconcileOutcome = 'settled' | 'failed_not_reached' | 'waiting' | 'unverified'

/** Ask the provider about one payment and apply its answer. */
type Reconcilable = Pick<IPayment, 'reference' | 'providerRef' | 'collectionSource' | 'method'> & { createdAt?: Date }

export async function reconcilePayment(payment: Reconcilable, now = new Date()): Promise<PaymentReconcileOutcome> {
  const provider = getProvider(payment.method as ProviderId, payment.collectionSource)
  const check = await checkCollection(provider, payment, now)
  const age = now.getTime() - new Date(payment.createdAt ?? now).getTime()
  if (check.kind === 'not_found') {
    if (age < NOT_REACHED_FAIL_AFTER_MS) return 'waiting'
    const failed = await finalizePayment({
      reference: payment.reference, providerRef: payment.providerRef ?? '', status: 'failed', amount: 0,
      timestamp: now.toISOString(), raw: { reason: 'never_reached_provider' },
    }, { source: 'reconciliation', providerSource: provider.source })
    return failed ? 'failed_not_reached' : 'waiting'
  }
  if (check.kind !== 'evidence') return 'unverified'
  if (check.event.status === 'failed' && check.providerStatus?.toLowerCase() === 'abandoned' && age < NOT_REACHED_FAIL_AFTER_MS) return 'waiting'
  const moved = await finalizePayment(check.event, { source: 'reconciliation', providerSource: provider.source })
  return moved ? 'settled' : 'waiting'
}

/**
 * The scheduled sweep. Each payment is claimed (next check pushed out by the
 * backoff) before the provider is called, so overlapping runs never ask about
 * it twice. `scope` narrows the sweep (tests share a database).
 */
export async function reconcileStalePayments(opts: { now?: Date; limit?: number; scope?: Record<string, unknown> } = {}) {
  const { now = new Date(), limit = 100, scope = {} } = opts
  const summary = { examined: 0, settled: 0, failed: 0, waiting: 0, errors: 0 }
  const due: Record<string, unknown> = {
    ...scope,
    status: { $in: ['pending', 'processing'] },
    createdAt: { $lt: new Date(now.getTime() - RECONCILE_MIN_AGE_MS) },
    $and: [
      { $or: [{ providerRef: { $type: 'string' } }, { collectionSource: 'paystack' }] },
      { $or: [{ nextProviderCheckAt: { $exists: false } }, { nextProviderCheckAt: { $lte: now } }] },
    ],
  }
  const candidates = await Payment.find(due).sort({ nextProviderCheckAt: 1, createdAt: 1 }).limit(limit).select('_id providerCheckAttempts').lean()
  for (const candidate of candidates) {
    const attempts = candidate.providerCheckAttempts ?? 0
    const claimed = await Payment.findOneAndUpdate(
      { ...due, _id: candidate._id },
      { $set: { nextProviderCheckAt: new Date(now.getTime() + reconcileBackoffMs(attempts)), lastProviderCheckAt: now.toISOString() }, $inc: { providerCheckAttempts: 1 } },
      { returnDocument: 'after' },
    ).lean()
    if (!claimed) continue
    summary.examined++
    try {
      const outcome = await reconcilePayment(claimed as unknown as Reconcilable, now)
      if (outcome === 'settled') summary.settled++
      else if (outcome === 'failed_not_reached') summary.failed++
      else summary.waiting++
    } catch (err) {
      summary.errors++
      logger.warn(`[Payments] reconcile ${claimed.reference} failed: ${(err as Error).message}`)
    }
  }
  return summary
}

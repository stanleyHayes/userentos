/**
 * Settle a payout whose transfer outcome is unknown by asking the provider.
 *
 * The only way out of needsReconciliation besides the provider's own webhook,
 * shared by the admin action (POST /payouts/:id/reconcile) and the scheduled
 * sweep below, so both apply exactly the same rules. A refund happens only
 * when the provider says the transfer failed, or has no record of it at all
 * well after it was sent.
 */
import { Payout, type IPayout } from '../../models/Payout.js'
import { recordAuditEntry } from '../../utils/audit.js'
import { isRegulatedFeatureEnabled } from '../../config/regulatedFeatures.js'
import { logger } from '../../utils/logger.js'
import { getPayoutProvider } from './index.js'
import { finalizePayout } from './finalize.js'

/** How long after sending a "no such transfer" answer is believed. */
export const NOT_FOUND_GRACE_MS = 15 * 60_000

export type ReconcileOutcome =
  | { kind: 'not_processing'; status: string }
  | { kind: 'unreachable' }
  | { kind: 'settled'; status: 'paid' | 'failed' }
  /** finalizePayout refused (amount mismatch): stays flagged for a human. */
  | { kind: 'mismatch' }
  /** Provider has no record right after sending — it may still be catching up. */
  | { kind: 'too_early' }
  /** Provider never created the transfer: back in the approval queue. */
  | { kind: 'requeued' }
  | { kind: 'pending' }

export async function reconcilePayout(
  payout: Pick<IPayout, '_id' | 'reference' | 'providerRef' | 'status' | 'approvedAt'>,
  opts: { source: 'admin' | 'reconciliation'; actorId?: string; ipAddress?: string },
): Promise<ReconcileOutcome> {
  if (payout.status !== 'processing') return { kind: 'not_processing', status: payout.status }

  let lookup
  try {
    lookup = await getPayoutProvider().verifyTransfer(payout.reference)
  } catch (err) {
    logger.error(`[Payouts] reconciliation lookup failed for ${payout.reference}: ${(err as Error).message}`)
    return { kind: 'unreachable' }
  }

  let outcome: ReconcileOutcome
  if (lookup.status === 'paid' || lookup.status === 'failed') {
    const moved = await finalizePayout({
      reference: payout.reference,
      providerRef: lookup.providerRef ?? payout.providerRef ?? '',
      status: lookup.status,
      amount: lookup.amount ?? 0,
      timestamp: new Date().toISOString(),
      failureReason: lookup.failureReason,
      reversed: lookup.reversed,
      raw: opts.actorId ? { reconciledBy: opts.actorId } : { reconciledBy: opts.source },
    }, { source: opts.source })
    if (!moved) {
      // A webhook may have settled it while we asked; only a payout still
      // processing after that is a genuine disagreement.
      const current = await Payout.findById(payout._id).select('status').lean()
      if (current && current.status !== 'processing') {
        await Payout.updateOne({ _id: payout._id }, { $unset: { needsReconciliation: '', nextReconcileAt: '' } })
        return { kind: 'settled', status: current.status === 'paid' ? 'paid' : 'failed' }
      }
      return { kind: 'mismatch' }
    }
    await Payout.updateOne({ _id: payout._id }, { $unset: { needsReconciliation: '', nextReconcileAt: '' } })
    outcome = { kind: 'settled', status: lookup.status }
  } else if (lookup.status === 'not_found') {
    const sentAt = payout.approvedAt?.getTime() ?? 0
    if (Date.now() - sentAt < NOT_FOUND_GRACE_MS) return { kind: 'too_early' }
    await Payout.updateOne(
      { _id: payout._id, status: 'processing' },
      { $set: { status: 'requested' }, $unset: { approvedBy: '', approvedAt: '', needsReconciliation: '', failureReason: '', nextReconcileAt: '' } },
    )
    outcome = { kind: 'requeued' }
  } else {
    outcome = { kind: 'pending' }
  }

  void recordAuditEntry({
    userId: opts.actorId ?? 'system',
    action: 'payout.reconciled',
    entityType: 'Payout',
    entityId: String(payout._id),
    details: { providerStatus: lookup.status, source: opts.source },
    ipAddress: opts.ipAddress,
  })
  return outcome
}

/** Payouts exist only while rent collection or the wallet is enabled (index.ts gates /api/payouts the same way). */
export const payoutsOffered = () => isRegulatedFeatureEnabled('rent_collection') || isRegulatedFeatureEnabled('wallet')

/** Payouts become eligible this long after the transfer was sent. */
export const RECONCILE_MIN_AGE_MS = 5 * 60_000
/**
 * A normally accepted transfer is first checked this long after approval:
 * by then its webhook is overdue. (A transfer whose send timed out is held
 * with needsReconciliation and checked from RECONCILE_MIN_AGE_MS.)
 */
export const WEBHOOK_OVERDUE_MS = 30 * 60_000
const BACKOFF_BASE_MS = 5 * 60_000
const BACKOFF_MAX_MS = 6 * 60 * 60_000

/** 5, 10, 20 … minutes between provider checks, capped at 6 hours. */
export function reconcileBackoffMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts), BACKOFF_MAX_MS)
}

/**
 * Scheduled sweep: ask the provider about every processing payout that is old
 * enough and due — not only those held for reconciliation, so a transfer whose
 * webhook never arrived stops blocking the payee's next payout. Approval
 * schedules the first check for when the webhook is overdue. Each payout is claimed (its next
 * check pushed out by the backoff) before the provider is called, so
 * overlapping runs or a crash mid-sweep never hammer the provider or skip
 * the backoff.
 */
export async function reconcileUncertainPayouts(opts: { now?: Date; limit?: number; userIds?: string[] } = {}) {
  const { now = new Date(), limit = 50, userIds } = opts
  const summary = { examined: 0, settled: 0, requeued: 0, waiting: 0, failed: 0 }
  // /api/payouts is behind the same gate: no payout can be offered, none is checked.
  if (!payoutsOffered()) return summary
  const due: Record<string, unknown> = {
    status: 'processing',
    approvedAt: { $lte: new Date(now.getTime() - RECONCILE_MIN_AGE_MS) },
    $or: [{ nextReconcileAt: { $exists: false } }, { nextReconcileAt: { $lte: now } }],
    // `userIds` limits the sweep to specific accounts (tests share a database).
    ...(userIds ? { userId: { $in: userIds } } : {}),
  }
  const candidates = await Payout.find(due).sort({ approvedAt: 1 }).limit(limit).select('_id reconcileAttempts').lean()
  for (const candidate of candidates) {
    const attempts = candidate.reconcileAttempts ?? 0
    const claimed = await Payout.findOneAndUpdate(
      { ...due, _id: candidate._id } as Record<string, unknown>,
      { $set: { lastReconcileAt: now, nextReconcileAt: new Date(now.getTime() + reconcileBackoffMs(attempts)) }, $inc: { reconcileAttempts: 1 } },
      { returnDocument: 'after' },
    )
    if (!claimed) continue
    summary.examined++
    try {
      const outcome = await reconcilePayout(claimed, { source: 'reconciliation' })
      if (outcome.kind === 'settled') summary.settled++
      else if (outcome.kind === 'requeued') summary.requeued++
      else if (outcome.kind === 'unreachable' || outcome.kind === 'mismatch') summary.failed++
      else summary.waiting++
    } catch (err) {
      summary.failed++
      logger.error(`[Payouts] scheduled reconciliation failed for ${claimed.reference}: ${(err as Error).message}`)
    }
  }
  return summary
}

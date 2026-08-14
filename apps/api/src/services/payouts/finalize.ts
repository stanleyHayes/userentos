/**
 * Shared payout finalizer — the single place a payout reaches a terminal state.
 *
 * Called by the Paystack webhook route and by the simulator subscription, so
 * dev and production converge on the same code path.
 *
 * Two properties matter more than anything else here:
 *
 *  - **Idempotency.** PSPs retry webhooks, and `transfer.failed` can arrive
 *    twice. The status move is a conditional update that excludes terminal
 *    states, so only one caller ever wins the transition and only that caller
 *    issues the refund.
 *  - **Refund on failure.** The wallet was debited when the payout was
 *    requested. If the transfer does not land, that money must go back, or the
 *    user has silently lost it. The `refunded` flag is set in the same guarded
 *    update, so a duplicate webhook cannot credit twice.
 */

import { Payout, TERMINAL_PAYOUT_STATES } from '../../models/Payout.js'
import { creditWallet } from '../payments/walletLedger.js'
import { notify } from '../notify.js'
import { AuditLog } from '../../models/AuditLog.js'
import { logger } from '../../utils/logger.js'
import type { PayoutWebhookEvent } from './types.js'

function auditPayout(action: string, payout: { _id: unknown; userId: string; reference: string; amount: number }, details: Record<string, unknown>) {
  AuditLog.create({
    userId: payout.userId,
    action,
    entityType: 'Payout',
    entityId: String(payout._id),
    details: JSON.stringify({ reference: payout.reference, amount: payout.amount, ...details }),
  }).catch((err) => logger.warn('[Payouts] audit log failed:', (err as Error).message))
}

/**
 * Apply a terminal payout event. Returns true if this call moved the payout,
 * false if it was already terminal or no matching payout exists.
 */
export async function finalizePayout(
  event: PayoutWebhookEvent,
  opts: { source: 'webhook' | 'simulator' | 'admin' },
): Promise<boolean> {
  const query = event.reference
    ? { reference: event.reference }
    : { providerRef: event.providerRef }

  const payout = await Payout.findOne(query)
  if (!payout) {
    logger.warn(`[Payouts:${opts.source}] no payout for reference=${event.reference} providerRef=${event.providerRef}`)
    return false
  }

  // Amount mismatch means the PSP moved a different sum than we recorded —
  // never reconcile that automatically, a human has to look at it.
  if (event.amount > 0 && Math.abs(event.amount - payout.amount) > 0.01) {
    logger.error(
      `[Payouts:${opts.source}] CRITICAL amount mismatch on ${payout.reference}: `
      + `recorded ${payout.amount}, provider reported ${event.amount}`,
    )
    auditPayout('payout.amount_mismatch', payout, { reported: event.amount, source: opts.source })
    return false
  }

  if (event.status === 'paid') {
    const paid = await Payout.findOneAndUpdate(
      { _id: payout._id, status: { $nin: [...TERMINAL_PAYOUT_STATES] } },
      { $set: { status: 'paid', paidAt: new Date(event.timestamp || Date.now()), providerRef: event.providerRef || payout.providerRef } },
      { returnDocument: 'after' },
    )
    if (!paid) return false // another worker already finalized it

    auditPayout('payout.paid', paid, { source: opts.source, providerRef: event.providerRef })
    notify({
      userId: paid.userId,
      title: 'Payout sent',
      message: `GHS ${paid.amount.toFixed(2)} is on its way to your ${paid.destination.bankName} account (${paid.destination.accountNumber}).`,
      actionUrl: '/savings',
    }).catch((err) => logger.warn('[Payouts] notify failed:', (err as Error).message))
    return true
  }

  // Failed or reversed — move to terminal AND claim the refund in one update.
  const failed = await Payout.findOneAndUpdate(
    { _id: payout._id, status: { $nin: [...TERMINAL_PAYOUT_STATES] }, refunded: false },
    { $set: { status: 'failed', failureReason: event.failureReason || 'Transfer failed', refunded: true, providerRef: event.providerRef || payout.providerRef } },
    { returnDocument: 'after' },
  )
  if (!failed) return false

  try {
    await creditWallet(failed.userId, failed.amount, {
      type: 'refund',
      reference: `${failed.reference}-REFUND`,
      description: 'Reversed payout — transfer did not go through',
    })
  } catch (err) {
    // The payout is terminal but the money is not back. This is the one case
    // that needs a human, so shout about it rather than swallowing it.
    logger.error(
      `[Payouts:${opts.source}] CRITICAL: payout ${failed.reference} failed but the wallet refund did not apply: ${(err as Error).message}`,
    )
    auditPayout('payout.refund_failed', failed, { source: opts.source, error: (err as Error).message })
    return true
  }

  auditPayout('payout.failed', failed, { source: opts.source, reason: failed.failureReason })
  notify({
    userId: failed.userId,
    title: 'Payout failed',
    message: `Your GHS ${failed.amount.toFixed(2)} payout could not be completed (${failed.failureReason}). The amount is back in your wallet.`,
    actionUrl: '/savings',
  }).catch((err) => logger.warn('[Payouts] notify failed:', (err as Error).message))
  return true
}

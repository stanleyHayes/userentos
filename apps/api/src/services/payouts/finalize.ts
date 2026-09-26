/**
 * Shared payout finalizer — the single place a payout reaches a terminal state.
 *
 * Called by the Paystack webhook dispatcher, the reconciliation sweep and the
 * simulator subscription, so dev and production converge on the same code
 * path.
 *
 * Three properties matter more than anything else here:
 *
 *  - **Idempotency.** PSPs retry webhooks, and `transfer.failed` can arrive
 *    twice. The status move is a conditional update that excludes terminal
 *    states, so only one caller ever wins the transition and only that caller
 *    claims the refund.
 *  - **Refund on failure.** The wallet was debited when the payout was
 *    requested. If the transfer does not land, that money must go back, or the
 *    user has silently lost it. The refund is captured as `refundIntent` in
 *    the same guarded update and applied through the durable wallet-credit
 *    journal (refund.ts), so a failed credit is retried and never doubled.
 *  - **Reversal after success.** Paystack can reverse a transfer it reported
 *    paid: the money comes back to the platform's balance. 'paid' is terminal
 *    for everything else, but a reversal moves it to 'reversed' once, with the
 *    same durable refund — before, the wallet was never re-credited.
 */

import { Payout, TERMINAL_PAYOUT_STATES, payoutRefundIntent, type IPayout } from '../../models/Payout.js'
import { applyPayoutRefund } from './refund.js'
import { notify } from '../notify.js'
import { AuditLog } from '../../models/AuditLog.js'
import { financialAlert } from '../payments/alerts.js'
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

/** Apply the claimed refund now; a failure is left for recoverPayoutRefunds, never lost. */
async function refundNow(payout: IPayout, source: string): Promise<boolean> {
  try {
    if (await applyPayoutRefund(String(payout._id))) return true
  } catch (err) {
    logger.error(`[Payouts:${source}] refund for ${payout.reference} deferred to recovery: ${(err as Error).message}`)
  }
  auditPayout('payout.refund_deferred', payout, { source })
  return false
}

/**
 * Apply a terminal payout event. Returns true if this call moved the payout,
 * false if it was already terminal, held for review, or no matching payout exists.
 */
export async function finalizePayout(
  event: PayoutWebhookEvent,
  opts: { source: 'webhook' | 'simulator' | 'admin' | 'reconciliation' },
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
  // never reconcile that automatically, a human has to look at it. Held for
  // reconciliation so the admin queue and the sweep both see it.
  if (event.amount > 0 && Math.abs(event.amount - payout.amount) > 0.01) {
    logger.error(
      `[Payouts:${opts.source}] CRITICAL amount mismatch on ${payout.reference}: `
      + `recorded ${payout.amount}, provider reported ${event.amount}`,
    )
    await Payout.updateOne(
      { _id: payout._id, status: { $nin: [...TERMINAL_PAYOUT_STATES] } },
      { $set: { needsReconciliation: true, failureReason: `amount_mismatch: provider reported ${event.amount}, recorded ${payout.amount}` } },
    )
    auditPayout('payout.amount_mismatch', payout, { reported: event.amount, source: opts.source })
    financialAlert('payout_amount_mismatch', { type: 'Payout', id: String(payout._id) }, { reference: payout.reference, recorded: payout.amount, reported: event.amount, status: payout.status })
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

  if (event.reversed && payout.status === 'paid') return reversePaidPayout(payout, event, opts.source)

  // Failed (or reversed before it was ever confirmed paid) — move to terminal
  // AND claim the refund in one update.
  const failed = await Payout.findOneAndUpdate(
    { _id: payout._id, status: { $nin: [...TERMINAL_PAYOUT_STATES] }, refunded: false },
    { $set: { status: 'failed', failureReason: event.failureReason || 'Transfer failed', refunded: true, refundIntent: payoutRefundIntent(payout), providerRef: event.providerRef || payout.providerRef } },
    { returnDocument: 'after', overwriteImmutable: true },
  )
  if (!failed) {
    // A reversal can race the success that preceded it.
    if (event.reversed) {
      const current = await Payout.findById(payout._id)
      if (current?.status === 'paid') return reversePaidPayout(current, event, opts.source)
    }
    return false
  }

  const refunded = await refundNow(failed, opts.source)
  auditPayout('payout.failed', failed, { source: opts.source, reason: failed.failureReason, refunded })
  notify({
    userId: failed.userId,
    title: 'Payout failed',
    message: refunded
      ? `Your GHS ${failed.amount.toFixed(2)} payout could not be completed (${failed.failureReason}). The amount is back in your wallet.`
      : `Your GHS ${failed.amount.toFixed(2)} payout could not be completed (${failed.failureReason}). The amount will be returned to your wallet shortly.`,
    actionUrl: '/savings',
  }).catch((err) => logger.warn('[Payouts] notify failed:', (err as Error).message))
  return true
}

/** The provider returned money it had reported delivered: refund the payee once. */
async function reversePaidPayout(payout: IPayout, event: PayoutWebhookEvent, source: string): Promise<boolean> {
  const reversed = await Payout.findOneAndUpdate(
    { _id: payout._id, status: 'paid', refunded: false },
    { $set: { status: 'reversed', refunded: true, reversedAt: new Date(), failureReason: event.failureReason || 'Transfer reversed by the provider', refundIntent: payoutRefundIntent(payout) } },
    { returnDocument: 'after', overwriteImmutable: true },
  )
  if (!reversed) return false
  const refunded = await refundNow(reversed, source)
  auditPayout('payout.reversed', reversed, { source, refunded })
  financialAlert('payout_reversed_after_success', { type: 'Payout', id: String(reversed._id) }, { reference: reversed.reference, amount: reversed.amount })
  notify({
    userId: reversed.userId,
    title: 'Payout reversed',
    message: `Your GHS ${reversed.amount.toFixed(2)} payout was returned by the provider. The amount is ${refunded ? 'back in your wallet' : 'being returned to your wallet'}.`,
    actionUrl: '/savings',
  }).catch((err) => logger.warn('[Payouts] notify failed:', (err as Error).message))
  return true
}

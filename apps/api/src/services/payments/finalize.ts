/**
 * Shared payment finalizer.
 *
 * Single source of truth for "what to do when a payment reaches a terminal state":
 *   - look up Payment by reference / providerRef
 *   - skip if already terminal (idempotency)
 *   - update fields, persist
 *   - fire notifications + achievement hooks
 *
 * Called by:
 *   - The webhook routes (real provider callback)
 *   - The simulator subscription (dev/seed mode)
 *   - The reconciliation cron (queryStatus poll)
 */

import { Payment } from '../../models/Payment.js'
import { activatePaidSubscription } from './paidSubscription.js'
import { recoverRentReceipt } from './recoverRentReceipts.js'
import { User } from '../../models/User.js'
import { SubscriptionPackage } from '../../models/SubscriptionPackage.js'
import { notifyPaymentConfirmed, notifyPaymentReceived } from '../notify.js'
import { checkAndAward } from '../achievements.js'
import { dispatchWebhook } from '../webhooks.js'
import { paymentCreditIntent, recoverPaymentWalletCredit } from './paymentWalletCredit.js'
import { AuditLog } from '../../models/AuditLog.js'
import { logger } from '../../utils/logger.js'
import type { WebhookEvent } from './types.js'

const TERMINAL_STATES = new Set(['completed', 'failed', 'refunded'])

const round2 = (n: number) => Math.round(n * 100) / 100

/** Best-effort audit entry for terminal payment transitions. */
function auditPayment(action: string, payment: { _id: unknown; tenantId: string; reference: string; amount: number }, details: Record<string, unknown>) {
  AuditLog.create({
    userId: payment.tenantId,
    action,
    entityType: 'Payment',
    entityId: String(payment._id),
    details: JSON.stringify({ reference: payment.reference, amount: payment.amount, ...details }),
  }).catch((err) => logger.warn('[Payments] audit log failed:', (err as Error).message))
}

/** Activate a paid subscription after its payment is verified. */
async function activateSubscription(userId: string, packageId?: string): Promise<void> {
  if (!packageId) throw new Error('subscription payment missing purposeMeta.packageId')
  const pkg = await SubscriptionPackage.findById(packageId).lean()
  if (!pkg) throw new Error(`package ${packageId} not found`)

  const now = new Date()
  const endDate = new Date(now)
  if (pkg.billingCycle === 'yearly') {
    endDate.setFullYear(endDate.getFullYear() + 1)
  } else {
    endDate.setMonth(endDate.getMonth() + 1)
  }

  await User.updateOne(
    { _id: userId },
    { $set: { subscriptionPackageId: packageId, subscriptionStartDate: now, subscriptionEndDate: endDate } },
  )
}

export interface FinalizeOptions {
  providerSource?: import('./types.js').CollectionSource
  /** Where this finalize call originated, for logging only. */
  source: 'webhook' | 'simulator' | 'reconciliation'
}

/**
 * Apply a normalized provider event to the matching Payment record.
 * Returns true if state changed, false if no-op (already terminal / not found / no-op event).
 */
export async function finalizePayment(
  event: WebhookEvent,
  opts: FinalizeOptions,
): Promise<boolean> {
  if (!['pending', 'completed', 'failed'].includes(event.status)) {
    logger.warn(`[Payments:${opts.source}] Unsupported normalized payment status ignored`)
    return false
  }
  // Locate the Payment. Prefer reference (always our PAY-XXXX-XXXX), fall back
  // to providerRef in case the event lacks the external reference.
  const candidates = !event.reference && event.providerRef ? await Payment.find({ providerRef: event.providerRef }).limit(2) : []
  if (candidates.length > 1) {
    logger.warn(`[Payments:${opts.source}] Ambiguous provider reference; payment unchanged`)
    return false
  }
  const payment = event.reference
    ? await Payment.findOne({ reference: event.reference })
    : candidates[0] ?? null

  if (!payment) {
    logger.warn(`[Payments:${opts.source}] no Payment found for ref=${event.reference} providerRef=${event.providerRef}`)
    return false
  }

  // Source comes from the verified callback route, never the callback body.
  if (payment.collectionSource && payment.collectionSource !== opts.providerSource) {
    logger.warn(`[Payments:${opts.source}] Collection source mismatch; payment unchanged`)
    return false
  }

  // Idempotency — never reprocess a terminal payment.
  if (TERMINAL_STATES.has(payment.status)) {
    return false
  }

  // Pending events aren't actionable.
  if (event.status === 'pending') {
    // The read above may predate completion or another provider-reference
    // assignment. A stale document save must not overwrite that evidence.
    await Payment.updateOne(
      { _id: payment._id, status: { $nin: [...TERMINAL_STATES] }, providerRef: payment.providerRef === undefined ? { $exists: false } : payment.providerRef },
      { $set: { lastProviderCheckAt: new Date().toISOString(), ...(event.providerRef && !payment.providerRef ? { providerRef: event.providerRef } : {}) } },
    )
    return false
  }

  const nowIso = new Date().toISOString()
  const baseSet: Record<string, unknown> = {
    providerStatus: event.status,
    lastProviderCheckAt: nowIso,
  }
  if (event.providerRef && !payment.providerRef) baseSet.providerRef = event.providerRef

  if (event.status === 'failed') {
    // Atomic terminal transition: only one caller (webhook vs reconciliation cron
    // vs retry) flips a non-terminal payment, so side-effects fire exactly once.
    const failed = await Payment.findOneAndUpdate(
      { _id: payment._id, status: { $nin: [...TERMINAL_STATES] } },
      { $set: { ...baseSet, status: 'failed', failureReason: inferFailureReason(event.raw) } },
      { returnDocument: 'after' },
    )
    if (!failed) return false // lost the race — already terminal
    auditPayment('payment.failed', failed, { source: opts.source, reason: failed.failureReason })
    dispatchWebhook('payment.failed', { paymentId: failed._id.toString(), reference: failed.reference, amount: failed.amount }, { userId: failed.tenantId })
    console.log(`[Payments:${opts.source}] marked ${failed.reference} FAILED (${failed.failureReason ?? 'unknown'})`)
    return true
  }

  // status === 'completed'
  if (event.currency !== 'GHS') {
    await Payment.updateOne(
      { _id: payment._id, status: { $nin: [...TERMINAL_STATES] } },
      { $set: { ...baseSet, status: 'processing', failureReason: 'currency_unverified: completion requires provider-confirmed GHS' } },
    )
    return false
  }
  // Validate the provider-reported amount against what we recorded, so a small
  // transfer (or a tampered/replayed event) cannot finalize a large obligation.
  const receivedMinor = Math.round(round2(event.amount) * 100)
  const expectedMinor = Math.round(round2(payment.amount) * 100)
  if (!Number.isSafeInteger(receivedMinor) || !Number.isSafeInteger(expectedMinor) || receivedMinor <= 0 || expectedMinor <= 0 || receivedMinor !== expectedMinor) {
    const flagged = await Payment.findOneAndUpdate(
      { _id: payment._id, status: { $nin: [...TERMINAL_STATES] } },
      { $set: { ...baseSet, status: 'processing', failureReason: `amount_mismatch: provider reported ${event.amount}, expected ${payment.amount}` } },
      { returnDocument: 'after' },
    )
    if (flagged) {
      logger.warn(`[Payments:${opts.source}] AMOUNT MISMATCH on ${payment.reference}: provider=${event.amount} expected=${payment.amount} — held in 'processing' for manual review`)
    }
    return false
  }

  // Capture the credit obligation in the same write as confirmation.
  const walletCreditIntent = paymentCreditIntent(payment)
  const completed = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $nin: [...TERMINAL_STATES] }, amount: payment.amount, tenantId: payment.tenantId, landlordId: payment.landlordId, purpose: payment.purpose, reference: payment.reference },
    { $set: { ...baseSet, status: 'completed', paidAt: event.timestamp || nowIso, ...(walletCreditIntent ? { walletCreditIntent } : {}) }, $unset: { failureReason: 1, collectionInitiationUncertainAt: 1 } },
    { returnDocument: 'after', overwriteImmutable: true, runValidators: true },
  )
  if (!completed) return false // lost the race — another worker already finalized
  auditPayment('payment.completed', completed, { source: opts.source, purpose: completed.purpose })
  if (completed.purpose === 'rent') {
    try { await recoverRentReceipt(String(completed._id)) }
    catch { logger.warn('[Payments] Rent receipt issuance deferred to scheduled recovery') }
  }

  // Funds are verified — apply what the payment was FOR.
  if (completed.walletCreditIntent) {
    try { await recoverPaymentWalletCredit(String(completed._id)) }
    catch { logger.error('[Payments] Confirmed payment credit deferred to scheduled recovery') }
  } else if (completed.purpose === 'subscription') {
    try {
      if (completed.subscriptionTerms) {
        const processed = await activatePaidSubscription(String(completed._id))
        if (!processed) logger.warn('[Payments] Paid subscription activation deferred to recovery')
      } else await activateSubscription(completed.tenantId, (completed.purposeMeta as { packageId?: string } | undefined)?.packageId)
    } catch (err) {
      console.error(`[Payments:${opts.source}] CRITICAL: subscription payment ${completed.reference} completed but activation failed: ${(err as Error).message}`)
    }
  }

  // Notifications (best-effort)
  try {
    if (completed.purpose === 'rent') {
      const tenant = await User.findById(completed.tenantId).select('firstName lastName').lean()
      const tenantName = tenant ? `${tenant.firstName} ${tenant.lastName}` : 'A tenant'
      await notifyPaymentConfirmed(completed.tenantId, completed.amount, completed.reference)
      if (completed.landlordId) {
        await notifyPaymentReceived(completed.landlordId, tenantName, completed.amount, completed.reference)
      }
    } else {
      await notifyPaymentConfirmed(completed.tenantId, completed.amount, completed.reference)
    }
  } catch (err) {
    logger.warn('[Payments] notify failed:', (err as Error).message)
  }

  dispatchWebhook('payment.completed', {
    paymentId: completed._id.toString(),
    reference: completed.reference,
    amount: completed.amount,
    agreementId: completed.agreementId,
    tenantId: completed.tenantId,
    landlordId: completed.landlordId,
  }, { userId: completed.tenantId })

  // Achievements / streaks (best-effort)
  checkAndAward(completed.tenantId, 'payment_completed', { paymentId: completed._id.toString() })
    .catch((err) => logger.warn('[Payments] checkAndAward failed:', (err as Error).message))

  console.log(`[Payments:${opts.source}] marked ${completed.reference} COMPLETED`)
  return true
}

function inferFailureReason(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  if (typeof r.reason === 'string') return r.reason
  if (typeof r.message === 'string') return r.message
  if (r.transaction && typeof r.transaction === 'object') {
    const t = r.transaction as Record<string, unknown>
    if (typeof t.message === 'string') return t.message
  }
  return undefined
}

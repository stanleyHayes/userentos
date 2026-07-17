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
import { User } from '../../models/User.js'
import { SubscriptionPackage } from '../../models/SubscriptionPackage.js'
import { notifyPaymentConfirmed, notifyPaymentReceived } from '../notify.js'
import { checkAndAward } from '../achievements.js'
import { dispatchWebhook } from '../webhooks.js'
import { creditWallet } from './walletLedger.js'
import type { WebhookEvent } from './types.js'

const TERMINAL_STATES = new Set(['completed', 'failed', 'refunded'])

const round2 = (n: number) => Math.round(n * 100) / 100

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
  // Locate the Payment. Prefer reference (always our PAY-XXXX-XXXX), fall back
  // to providerRef in case the event lacks the external reference.
  const payment = event.reference
    ? await Payment.findOne({ reference: event.reference })
    : event.providerRef
      ? await Payment.findOne({ providerRef: event.providerRef })
      : null

  if (!payment) {
    console.warn(`[Payments:${opts.source}] no Payment found for ref=${event.reference} providerRef=${event.providerRef}`)
    return false
  }

  // Idempotency — never reprocess a terminal payment.
  if (TERMINAL_STATES.has(payment.status)) {
    return false
  }

  // Pending events aren't actionable.
  if (event.status === 'pending') {
    payment.lastProviderCheckAt = new Date().toISOString()
    if (event.providerRef && !payment.providerRef) payment.providerRef = event.providerRef
    await payment.save()
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
      { new: true },
    )
    if (!failed) return false // lost the race — already terminal
    dispatchWebhook('payment.failed', { paymentId: failed._id.toString(), reference: failed.reference, amount: failed.amount }, { userId: failed.tenantId })
    console.log(`[Payments:${opts.source}] marked ${failed.reference} FAILED (${failed.failureReason ?? 'unknown'})`)
    return true
  }

  // status === 'completed'
  // Validate the provider-reported amount against what we recorded, so a small
  // transfer (or a tampered/replayed event) cannot finalize a large obligation.
  if (Number.isFinite(event.amount) && Math.abs(round2(event.amount) - round2(payment.amount)) > 0.01) {
    const flagged = await Payment.findOneAndUpdate(
      { _id: payment._id, status: { $nin: [...TERMINAL_STATES] } },
      { $set: { ...baseSet, status: 'processing', failureReason: `amount_mismatch: provider reported ${event.amount}, expected ${payment.amount}` } },
      { new: true },
    )
    if (flagged) {
      console.warn(`[Payments:${opts.source}] AMOUNT MISMATCH on ${payment.reference}: provider=${event.amount} expected=${payment.amount} — held in 'processing' for manual review`)
    }
    return false
  }

  // Atomic terminal transition — guarantees the completion side-effects run once.
  const completed = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $nin: [...TERMINAL_STATES] } },
    { $set: { ...baseSet, status: 'completed', paidAt: event.timestamp || nowIso } },
    { new: true },
  )
  if (!completed) return false // lost the race — another worker already finalized

  // Funds are verified — apply what the payment was FOR.
  if (completed.purpose === 'wallet_deposit') {
    try {
      await creditWallet(completed.tenantId, completed.amount, {
        type: 'deposit',
        reference: completed.reference,
        description: 'Wallet deposit',
      })
      console.log(`[Payments:${opts.source}] wallet credited for deposit ${completed.reference}`)
    } catch (err) {
      // Payment is terminal but the wallet wasn't credited — needs reconciliation.
      console.error(`[Payments:${opts.source}] CRITICAL: deposit ${completed.reference} completed but wallet credit failed: ${(err as Error).message}`)
    }
  } else if (completed.purpose === 'subscription') {
    try {
      await activateSubscription(completed.tenantId, (completed.purposeMeta as { packageId?: string } | undefined)?.packageId)
      console.log(`[Payments:${opts.source}] subscription activated for payment ${completed.reference}`)
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
    console.warn('[Payments] notify failed:', (err as Error).message)
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
    .catch((err) => console.warn('[Payments] checkAndAward failed:', (err as Error).message))

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

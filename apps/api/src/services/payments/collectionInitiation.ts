import { Payment, type IPayment } from '../../models/Payment.js'
import type { InitiateResult } from './types.js'

/** An initiation response must never overwrite a concurrently finalized payment. */
export async function recordCollectionInitiation(paymentId: string, result: InitiateResult) {
  await Payment.updateOne({ _id: paymentId, status: { $in: ['pending', 'processing'] } }, {
    $set: { providerRef: result.providerRef, providerStatus: result.status, ...(typeof result.instructions === 'string' ? { providerInstructions: result.instructions } : {}) },
    $unset: { collectionInitiationUncertainAt: 1 },
  })
  return Payment.findById(paymentId).lean()
}

/** A transport/storage exception is not evidence that the provider rejected a charge. */
export async function recordUncertainCollection(paymentId: string) {
  await Payment.updateOne({ _id: paymentId, status: { $in: ['pending', 'processing'] } }, {
    $set: { status: 'processing', collectionInitiationUncertainAt: new Date() },
  })
}

/**
 * The provider refused outright (CollectionRefusedError): no charge exists, so
 * the payment fails now and its obligation is freed for the payer's corrected
 * retry, instead of holding it until reconciliation or an admin gives up on it.
 */
export async function recordRefusedCollection(paymentId: string, reason: string | undefined) {
  return Payment.findOneAndUpdate({ _id: paymentId, status: { $in: ['pending', 'processing'] } }, {
    $set: { status: 'failed', providerStatus: 'failed', failureReason: `provider_refused${reason ? `: ${reason}` : ''}` },
    // The provider refused, so no charge exists: free the idempotency key as
    // well, or a retry with the same details replays this failed row as
    // "Payment initiated" (clients keep the key after an error response).
    $unset: { openCollectionKey: 1, collectionInitiationUncertainAt: 1, idempotencyKey: 1 },
  }, { returnDocument: 'after' }).lean()
}

/** Held for an amount or currency mismatch: money moved, so only an admin may close it. */
const HELD = /^(amount_mismatch|currency_unverified)/

/**
 * Payments the payer may call off themselves, because nothing will resolve
 * them soon without a provider webhook: a bank transfer (pay by reference, no
 * status lookup), a collection on a direct telco rail (no verified lookup
 * either), or one whose initiation was interrupted. Each holds its
 * obligation's one in-flight slot, so without this a tenant who picked bank
 * transfer could not switch to mobile money for that rent period. A Paystack
 * collection in progress is not cancellable: reconciliation settles it.
 */
export const PAYER_CANCELLABLE: Record<string, unknown> = {
  status: { $in: ['pending', 'processing'] },
  failureReason: { $not: HELD },
  $or: [
    { method: 'bank_transfer' },
    { collectionSource: { $in: ['bank_transfer', 'mtn_momo', 'telecel_cash', 'airteltigo_money'] } },
    { collectionInitiationUncertainAt: { $exists: true } },
  ],
}

export function isPayerCancellable(payment: Pick<IPayment, 'status' | 'failureReason' | 'method' | 'collectionSource' | 'collectionInitiationUncertainAt'>): boolean {
  return ['pending', 'processing'].includes(payment.status)
    && !HELD.test(payment.failureReason ?? '')
    && (payment.method === 'bank_transfer'
      || ['bank_transfer', 'mtn_momo', 'telecel_cash', 'airteltigo_money'].includes(payment.collectionSource ?? '')
      || !!payment.collectionInitiationUncertainAt)
}

/**
 * Cancel the payer's own payment, conditionally: a webhook that completed it
 * meanwhile wins. A transfer that still lands later is not lost — the
 * finalizer revives a failed payment on a verified success for the exact
 * amount and alerts an admin.
 */
export async function cancelByPayer(paymentId: string, payerId: string) {
  return Payment.findOneAndUpdate(
    { _id: paymentId, tenantId: payerId, ...PAYER_CANCELLABLE },
    { $set: { status: 'failed', failureReason: 'cancelled_by_payer' }, $unset: { openCollectionKey: 1 } },
    { returnDocument: 'after' },
  ).lean()
}

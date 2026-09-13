import { Payment } from '../../models/Payment.js'
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

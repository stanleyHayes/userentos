import type { CollectionSource, PaymentProvider, WebhookEvent } from './types.js'

interface Reconcilable { reference: string; providerRef?: string; collectionSource?: CollectionSource }

/**
 * What to ask the provider about. Paystack collections are keyed on our own
 * reference, so even a payment whose initiation response was lost (and so
 * never recorded a providerRef) can still be looked up.
 */
export function paymentCorrelator(payment: Reconcilable): string | undefined {
  return payment.providerRef || (payment.collectionSource === 'paystack' ? payment.reference : undefined)
}

export type CollectionCheck =
  | { kind: 'evidence'; event: WebhookEvent; providerStatus?: string }
  /** The provider answered that it has no such collection. */
  | { kind: 'not_found' }
  /** Nothing usable: no correlator, a status-only adapter, an outage, or facts that do not match. */
  | { kind: 'unverified' }

/** Never substitute our expected amount or the polling time for payment facts. */
export async function checkCollection(provider: PaymentProvider, payment: Reconcilable, now = new Date()): Promise<CollectionCheck> {
  const correlator = paymentCorrelator(payment)
  if (!correlator || !provider.queryCollection) return { kind: 'unverified' }
  const verified = await provider.queryCollection(correlator)
  if (verified && 'notFound' in verified) return { kind: 'not_found' }
  if (!verified || verified.status === 'pending' || verified.reference !== payment.reference || verified.currency !== 'GHS' || !Number.isFinite(verified.amount) || verified.amount <= 0) return { kind: 'unverified' }
  let timestamp = now.toISOString()
  if (verified.status === 'completed') {
    if (typeof verified.paidAt !== 'string') return { kind: 'unverified' }
    const paidAt = new Date(verified.paidAt)
    if (!Number.isFinite(paidAt.getTime()) || paidAt > now) return { kind: 'unverified' }
    timestamp = paidAt.toISOString()
  }
  return {
    kind: 'evidence',
    providerStatus: verified.providerStatus,
    event: { reference: verified.reference, providerRef: correlator, status: verified.status, amount: verified.amount, currency: verified.currency, timestamp, raw: { reconciled: true, currency: verified.currency } },
  }
}

/** Settlement evidence only, or null. */
export async function reconciliationEvidence(provider: PaymentProvider, payment: Reconcilable, now = new Date()): Promise<WebhookEvent | null> {
  const check = await checkCollection(provider, payment, now)
  return check.kind === 'evidence' ? check.event : null
}

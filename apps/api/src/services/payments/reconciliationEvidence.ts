import type { PaymentProvider, WebhookEvent } from './types.js'

/** Never substitute our expected amount or the polling time for payment facts. */
export async function reconciliationEvidence(provider: PaymentProvider, payment: { reference: string; providerRef?: string }, now = new Date()): Promise<WebhookEvent | null> {
  if (!payment.providerRef || !provider.queryCollection) return null
  const verified = await provider.queryCollection(payment.providerRef)
  if (!verified || verified.status === 'pending' || verified.reference !== payment.reference || verified.currency !== 'GHS' || !Number.isFinite(verified.amount) || verified.amount <= 0) return null
  let timestamp = now.toISOString()
  if (verified.status === 'completed') {
    if (typeof verified.paidAt !== 'string') return null
    const paidAt = new Date(verified.paidAt)
    if (!Number.isFinite(paidAt.getTime()) || paidAt > now) return null
    timestamp = paidAt.toISOString()
  }
  return { reference: verified.reference, providerRef: payment.providerRef, status: verified.status, amount: verified.amount, currency: verified.currency, timestamp, raw: { reconciled: true, currency: verified.currency } }
}

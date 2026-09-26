/**
 * Every Paystack event, one way in.
 *
 * Paystack posts every event for an integration to ONE webhook URL. There
 * used to be two receivers, each dropping the other's half: the marketplace
 * one ignored transfers, the payouts one acknowledged every charge as
 * "Event ignored" — and render.yaml pointed Paystack at the payouts one, so
 * every rent, deposit, subscription and marketplace charge was a no-op.
 *
 * Now each event is:
 *  1. stored (WebhookEvent, unique per event id) BEFORE any processing, so a
 *     crash or deploy mid-handler leaves it for the dead-letter sweep;
 *  2. leased, so one delivery (or sweep) processes it at a time;
 *  3. dispatched by family — charges to the marketplace order or payment they
 *     name, transfers to the payout finalizer, refunds and chargebacks to the
 *     refund service;
 *  4. marked processed only after that succeeded. A thrown failure releases
 *     the lease and records the error; the route answers 500 so Paystack
 *     retries, and the sweep retries it too.
 * Every handler below is idempotent in its own right, so a second delivery
 * after success, or a sweep racing a delivery, applies nothing twice.
 */
import { createHash } from 'node:crypto'
import { WebhookEvent } from '../../models/WebhookEvent.js'
import { MarketplaceTransaction } from '../../models/MarketplaceTransaction.js'
import { verifyTransaction } from '../marketplace/paystack.js'
import { applySuccessfulCharge, SETTLEABLE_STATUSES } from '../marketplace/settle.js'
import { finalizePayment } from './finalize.js'
import { paystackMtnProvider } from './paystackRent.js'
import { paystackPayoutProvider } from '../payouts/paystack.js'
import { finalizePayout } from '../payouts/finalize.js'
import { applyDisputeEvent, applyRefundEvent, type PaystackEventBody } from './refunds.js'
import { financialAlert } from './alerts.js'
import { logger } from '../../utils/logger.js'

/** Give up on the sweep after this many attempts; the row stays for a human to inspect. */
export const MAX_WEBHOOK_ATTEMPTS = 5
/** Longer than a provider round-trip (20s timeout) plus our own writes. */
const LEASE_MS = 2 * 60_000
/** The body limit on the route; anything stored is the whole event, never a truncated one. */
const MAX_PAYLOAD = 256 * 1024

/**
 * One id per event and family. Charge, refund, dispute and transfer ids live
 * in different spaces, and a transfer's success and later reversal share its
 * id, so the event name is part of the key. A body with no usable id falls
 * back to its own hash, so two different events can never collide.
 *
 * A refund is keyed on its own id or refund_reference, never on
 * transaction_reference: that names the CHARGE, which every partial refund of
 * it shares, so a second partial refund would be taken for a redelivery of
 * the first and never applied.
 */
export function paystackEventId(body: PaystackEventBody, raw: string): string {
  const data = body.data ?? {}
  const id = body.event?.startsWith('refund.')
    ? data.id ?? data.refund_reference
    : data.id ?? data.transaction_reference ?? (data as { transfer_code?: string }).transfer_code ?? data.reference
  const token = id === undefined || id === null || id === '' ? `sha256:${createHash('sha256').update(raw).digest('hex')}` : String(id)
  return `${body.event ?? 'unknown'}:${token}`
}

/** The reference an event names, for the admin view and investigation. */
function eventReference(body: PaystackEventBody): string | undefined {
  const data = body.data ?? {}
  const transaction = typeof data.transaction === 'object' && data.transaction ? data.transaction : undefined
  return data.reference ?? data.transaction_reference ?? transaction?.reference
}

/** Store a verified event before anything acts on it. Idempotent: a redelivery finds the stored row. */
export async function recordPaystackEvent(raw: string, body: PaystackEventBody): Promise<string> {
  const eventId = paystackEventId(body, raw)
  try {
    await WebhookEvent.updateOne(
      { provider: 'paystack', eventId },
      { $setOnInsert: { eventType: body.event ?? 'unknown', reference: eventReference(body), payload: raw.slice(0, MAX_PAYLOAD), attempts: 0 } },
      { upsert: true },
    )
  } catch (err) {
    // Two deliveries upserting at once: the loser's row already exists.
    if ((err as { code?: number }).code !== 11000) throw err
  }
  return eventId
}

export type ProcessOutcome = 'processed' | 'already_processed' | 'in_progress'

/**
 * Lease, dispatch and record one stored event. Throws when processing
 * failed, after recording the error and releasing the lease for a retry.
 */
export async function processPaystackEvent(eventId: string): Promise<ProcessOutcome> {
  const now = new Date()
  const claimed = await WebhookEvent.findOneAndUpdate(
    { provider: 'paystack', eventId, processedAt: { $exists: false }, $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }] },
    { $set: { leaseUntil: new Date(now.getTime() + LEASE_MS) }, $inc: { attempts: 1 } },
    { returnDocument: 'after' },
  )
  if (!claimed) {
    const current = await WebhookEvent.findOne({ provider: 'paystack', eventId }).select('processedAt').lean()
    return current?.processedAt ? 'already_processed' : 'in_progress'
  }
  try {
    const body = JSON.parse(claimed.payload) as PaystackEventBody
    await dispatchPaystackEvent(body, claimed.payload, eventId)
    await WebhookEvent.updateOne({ _id: claimed._id }, { $set: { processedAt: new Date() }, $unset: { processingError: 1, leaseUntil: 1 } })
    return 'processed'
  } catch (err) {
    await WebhookEvent.updateOne({ _id: claimed._id }, { $set: { processingError: (err as Error).message }, $unset: { leaseUntil: 1 } }).catch(() => undefined)
    throw err
  }
}

/** Route one event to the code that owns its family. Throws only on a failure worth retrying. */
export async function dispatchPaystackEvent(body: PaystackEventBody, raw: string, eventId: string): Promise<void> {
  const type = body.event ?? ''
  // Before charge.*: a dispute is named charge.dispute.*.
  if (type.startsWith('charge.dispute.')) {
    await applyDisputeEvent(body)
    return
  }
  if (type === 'charge.success' || type === 'charge.failed') {
    await applyChargeEvent(body, raw, eventId)
    return
  }
  if (type.startsWith('transfer.')) {
    // Pure parsing: the payout adapter needs no key to read a verified body.
    await finalizePayout(paystackPayoutProvider.parseWebhook(raw), { source: 'webhook' })
    return
  }
  if (type.startsWith('refund.')) {
    await applyRefundEvent(body, eventId)
    return
  }
  // subscription.*, invoice.*, customeridentification.* and the rest: nothing
  // here acts on them. Stored and acknowledged, so Paystack stops retrying.
  logger.info(`[PaystackEvents] ${type || 'unnamed event'} acknowledged; no handler`)
}

/**
 * A charge names either a marketplace order (MKT-/SPN-) or a rent, deposit or
 * subscription payment (PAY-/DEP-/SUB-). Orders are re-verified with Paystack
 * and settled by the shared rules; payments go through the shared finalizer.
 */
async function applyChargeEvent(body: PaystackEventBody, raw: string, eventId: string): Promise<void> {
  const reference = body.data?.reference
  if (!reference) return
  const transaction = await MarketplaceTransaction.findOne({ reference })
  if (!transaction) {
    const handled = await finalizePayment(paystackMtnProvider.parseWebhook(raw), { source: 'webhook', providerSource: 'paystack' })
    if (!handled) logger.info(`[PaystackEvents] ${body.event} for ${reference} changed nothing (unknown, already final, or held)`)
    return
  }

  // Recorded on the order too, so /verify and the sweep can see it. The event
  // lease already makes this delivery the only one processing it, and every
  // step below is conditional, so an id left recorded by a crashed attempt
  // must not stop the retry from finishing the work.
  const claimed = await MarketplaceTransaction.findOneAndUpdate(
    { _id: transaction._id },
    { $addToSet: { processedEventIds: eventId } },
    { returnDocument: 'after' },
  )
  if (!claimed) return
  try {
    if (body.event === 'charge.success') {
      // Never take the webhook's word for it: re-verify, then the shared rules,
      // which also take a late success on a checkout we already closed.
      const verified = await verifyTransaction(reference)
      const outcome = await applySuccessfulCharge(claimed, verified, 'webhook')
      if (!outcome.applied && ['amount_mismatch', 'currency_mismatch', 'binding_mismatch', 'reference_mismatch'].includes(outcome.reason)) {
        // Money moved that does not match the order: a human decides.
        financialAlert('marketplace_charge_refused', { type: 'MarketplaceTransaction', id: String(transaction._id) }, { reference, reason: outcome.reason, amount: verified.amount, currency: verified.currency })
      }
    } else {
      await MarketplaceTransaction.updateOne(
        { _id: transaction._id, status: { $in: SETTLEABLE_STATUSES } },
        { $set: { status: 'failed', failureReason: 'provider_failed' }, $unset: { openOrderKey: 1 } },
      )
    }
  } catch (err) {
    // Hand the claim back, or the retry can never get past the guard above.
    await MarketplaceTransaction.updateOne({ _id: transaction._id }, { $pull: { processedEventIds: eventId } }).catch(() => undefined)
    throw err
  }
}

export interface SweepResult { examined: number; recovered: number; exhausted: number }

/**
 * The dead-letter sweep: re-dispatch every stored event that was never marked
 * processed, whatever its family. Selection is "no processedAt, attempts
 * left" rather than a status column, so an event that died before any
 * bookkeeping ran is still caught.
 */
export async function retryUnprocessedWebhooks(limit = 50, scope: Record<string, unknown> = {}): Promise<SweepResult> {
  const now = new Date()
  const stale = await WebhookEvent.find({
    // `scope` narrows the sweep (tests share a database).
    ...scope,
    provider: 'paystack',
    processedAt: { $exists: false },
    attempts: { $lt: MAX_WEBHOOK_ATTEMPTS },
    $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }],
  }).sort({ createdAt: 1 }).limit(limit).select('eventId attempts').lean()

  const result: SweepResult = { examined: stale.length, recovered: 0, exhausted: 0 }
  for (const event of stale) {
    try {
      if (await processPaystackEvent(event.eventId) === 'processed') result.recovered++
    } catch (err) {
      if ((event.attempts ?? 0) + 1 >= MAX_WEBHOOK_ATTEMPTS) {
        result.exhausted++
        logger.error(`[PaystackEvents] ${event.eventId} exhausted ${MAX_WEBHOOK_ATTEMPTS} attempts: ${(err as Error).message}`)
      }
    }
  }
  return result
}

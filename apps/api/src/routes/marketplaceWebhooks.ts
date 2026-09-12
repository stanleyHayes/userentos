/**
 * Paystack marketplace webhooks (spec §8.4).
 *
 * Mounted with a route-local raw body parser BEFORE the global JSON middleware,
 * because the signature is computed over the exact bytes Paystack sent.
 *
 * Idempotency is enforced by recording each provider event id on the
 * transaction inside a conditional update, so a replayed event cannot produce a
 * second financial effect — the acceptance matrix requires exactly that.
 */
import { Router, type Request, type Response } from 'express'
import express from 'express'
import { MarketplaceTransaction } from '../models/MarketplaceTransaction.js'
import { WebhookEvent } from '../models/WebhookEvent.js'
import { verifyWebhookSignature, verifyTransaction } from '../services/marketplace/paystack.js'
import { logger } from '../utils/logger.js'
import { finalizePayment } from '../services/payments/finalize.js'
import { paystackMtnProvider } from '../services/payments/paystackRent.js'
import { applySuccessfulCharge } from '../services/marketplace/settle.js'

const router = Router()
const rawBody = express.raw({ type: '*/*', limit: '256kb' })

/** Mark an event applied so the dead-letter sweep skips it. */
async function markEventProcessed(eventId: string): Promise<void> {
  await WebhookEvent.updateOne(
    { provider: 'paystack', eventId },
    { $set: { processedAt: new Date(), processingError: undefined } },
  ).catch(() => undefined)
}

interface PaystackChargeEvent {
  event: string
  id?: string | number
  data: {
    id?: string | number
    reference?: string
    status?: string
    amount?: number
    fees?: number
    currency?: string
    paid_at?: string
  }
}

router.post('/paystack', rawBody, async (req: Request, res: Response) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : ''
  if (!raw) {
    res.status(400).json({ success: false, error: 'Empty webhook body' })
    return
  }

  const signature = req.headers['x-paystack-signature']
  if (!verifyWebhookSignature(raw, typeof signature === 'string' ? signature : undefined)) {
    logger.warn('[MarketplaceWebhook] signature verification failed')
    res.status(401).json({ success: false, error: 'Invalid signature' })
    return
  }

  let event: PaystackChargeEvent
  try {
    event = JSON.parse(raw) as PaystackChargeEvent
  } catch {
    res.status(400).json({ success: false, error: 'Malformed webhook body' })
    return
  }

  // Acknowledge immediately: Paystack retries on non-2xx, and a slow handler
  // turns one event into a storm. Processing continues after the response.
  res.status(200).json({ success: true })

  const eventId = String(event.id ?? event.data?.id ?? event.data?.reference ?? '')
  /** Set once this delivery owns the event, so a throw can hand it back. */
  let claimedTransactionId: string | null = null
  const reference = event.data?.reference

  try {
    // Raw payload retained for dispute investigation (spec §8.4). Stored
    // BEFORE processing so a crash mid-handler still leaves the event on disk
    // for the dead-letter sweep to retry.
    await WebhookEvent.create({
      provider: 'paystack',
      eventId,
      eventType: event.event,
      reference,
      payload: raw.slice(0, 20_000),
      attempts: 1,
    }).catch(() => undefined)

    if (!reference) return
    if (!['charge.success', 'charge.failed', 'refund.processed', 'refund.failed'].includes(event.event)) return

    const transaction = await MarketplaceTransaction.findOne({ reference })
    if (!transaction) {
      // Paystack posts EVERY event for the account to a single webhook URL, so
      // a rent/savings/subscription charge arrives here too. Before this it was
      // logged and dropped, which would have left every Paystack-rail rent
      // payment stuck at pending until the reconcile sweep caught it.
      const handled = await finalizePayment(paystackMtnProvider.parseWebhook(raw), { source: 'webhook' })
      if (!handled) {
        logger.warn(`[MarketplaceWebhook] reference ${reference} matched no marketplace transaction and no payment`)
      }
      return
    }

    /*
     * The idempotency guard: claim this event id, and only proceed if THIS
     * call was the one that claimed it.
     *
     * The claim has to be taken BEFORE the work, or two concurrent deliveries
     * of the same event both apply it. But it must be RELEASED if the work
     * then throws — otherwise a transient failure (the provider unreachable
     * during re-verification, a dropped database connection) permanently
     * poisons the event: the catch below queues it for
     * retryUnprocessedWebhooks, the sweep re-delivers it, and this guard
     * rejects it as "already applied" when nothing was ever applied. The
     * comment in that catch promised a retry the claim quietly prevented.
     */
    const claimed = await MarketplaceTransaction.findOneAndUpdate(
      { _id: transaction._id, processedEventIds: { $ne: eventId } },
      { $addToSet: { processedEventIds: eventId } },
      { returnDocument: 'after' },
    )
    if (!claimed) {
      logger.info(`[MarketplaceWebhook] event ${eventId} already applied to ${reference}`)
      return
    }
    claimedTransactionId = String(transaction._id)

    if (event.event === 'charge.success') {
      // Never take the webhook's word for it — re-verify server-side, then
      // apply the shared settlement rules (amount guard, settlement status,
      // sponsorship activation) so this path and /verify cannot drift.
      const verified = await verifyTransaction(reference)
      const outcome = await applySuccessfulCharge(claimed, verified, 'webhook')
      if (!outcome.applied && outcome.reason !== 'already_paid') return

      await markEventProcessed(eventId)
    } else if (event.event === 'charge.failed') {
      claimed.status = 'failed'
      await claimed.save()
      await markEventProcessed(eventId)
    } else if (event.event === 'refund.processed') {
      claimed.status = 'refunded'
      await claimed.save()
      await markEventProcessed(eventId)
    }
  } catch (err) {
    // Left unprocessed on purpose: retryUnprocessedWebhooks picks it up on the
    // next sweep and asks the provider again rather than trusting this attempt.
    const message = (err as Error).message

    // Release the claim, or that retry can never get past the guard above.
    // Only on a THROWN failure: a deliberate refusal (amount mismatch, not
    // successful) is a permanent decision that has already been logged, and
    // releasing it would have the sweep re-refuse it forever.
    if (claimedTransactionId) {
      await MarketplaceTransaction.updateOne(
        { _id: claimedTransactionId },
        { $pull: { processedEventIds: eventId } },
      ).catch(() => undefined)
    }

    await WebhookEvent.updateOne({ provider: 'paystack', eventId }, { $set: { processingError: message } })
      .catch(() => undefined)
    logger.error(`[MarketplaceWebhook] processing failed for ${reference}: ${message} — claim released, queued for retry`)
  }
})

export default router

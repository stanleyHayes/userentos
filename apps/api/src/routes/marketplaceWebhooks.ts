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

const router = Router()
const rawBody = express.raw({ type: '*/*', limit: '256kb' })

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
  const reference = event.data?.reference

  try {
    // Raw payload retained for dispute investigation (spec §8.4).
    await WebhookEvent.create({
      provider: 'paystack',
      eventId,
      eventType: event.event,
      reference,
      payload: raw.slice(0, 20_000),
    }).catch(() => undefined)

    if (!reference) return
    if (!['charge.success', 'charge.failed', 'refund.processed', 'refund.failed'].includes(event.event)) return

    const transaction = await MarketplaceTransaction.findOne({ reference })
    if (!transaction) {
      logger.warn(`[MarketplaceWebhook] no transaction for reference ${reference}`)
      return
    }

    // The idempotency guard: claim this event id, and only proceed if THIS
    // call was the one that claimed it.
    const claimed = await MarketplaceTransaction.findOneAndUpdate(
      { _id: transaction._id, processedEventIds: { $ne: eventId } },
      { $addToSet: { processedEventIds: eventId } },
      { returnDocument: 'after' },
    )
    if (!claimed) {
      logger.info(`[MarketplaceWebhook] event ${eventId} already applied to ${reference}`)
      return
    }

    if (event.event === 'charge.success') {
      // Never take the webhook's word for it — re-verify server-side.
      const verified = await verifyTransaction(reference)
      if (verified.status !== 'success') {
        logger.error(`[MarketplaceWebhook] ${reference} claimed success but verification says ${verified.status}`)
        return
      }
      if (Math.abs(verified.amount - (claimed.grossAmount - claimed.discountAmount)) > 0.01) {
        logger.error(
          `[MarketplaceWebhook] CRITICAL amount mismatch on ${reference}: expected ${claimed.grossAmount - claimed.discountAmount}, provider says ${verified.amount}`,
        )
        return
      }

      claimed.status = 'paid'
      claimed.verifiedAt = new Date()
      claimed.processorFeeAmount = verified.fees
      claimed.settlementStatus = 'pending'
      await claimed.save()
      logger.info(`[MarketplaceWebhook] ${reference} paid — platform fee ${claimed.platformFeeAmount}`)
    } else if (event.event === 'charge.failed') {
      claimed.status = 'failed'
      await claimed.save()
    } else if (event.event === 'refund.processed') {
      claimed.status = 'refunded'
      await claimed.save()
    }
  } catch (err) {
    // The event is stored; a dead-letter sweep can retry from WebhookEvent.
    logger.error(`[MarketplaceWebhook] processing failed for ${reference}: ${(err as Error).message}`)
  }
})

export default router

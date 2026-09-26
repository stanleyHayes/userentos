/**
 * The one Paystack webhook: POST /api/webhooks/paystack.
 *
 * Paystack sends every event for an integration to a single URL, so this is
 * the URL to set in the Paystack dashboard (live and test). The two older
 * paths — /api/webhooks/marketplace/paystack and /api/webhooks/payouts/paystack
 * — are aliases of this handler, so events are not lost while the dashboard
 * setting is switched.
 *
 * Mounted with a route-local raw body parser BEFORE the global JSON
 * middleware, because the signature is an HMAC over the exact bytes sent.
 * The response is 200 only once the event has been processed or was already
 * processed; a failure answers 500 so Paystack retries (the event is stored
 * first, so the dead-letter sweep retries it as well).
 */
import { Router, type Request, type RequestHandler, type Response } from 'express'
import express from 'express'
import { verifyWebhookSignature } from '../services/marketplace/paystack.js'
import { processPaystackEvent, recordPaystackEvent } from '../services/payments/paystackEvents.js'
import type { PaystackEventBody } from '../services/payments/refunds.js'
import { trackInFlight } from '../services/inFlight.js'
import { logger } from '../utils/logger.js'

export const rawBody = express.raw({ type: '*/*', limit: '256kb' })

export const paystackWebhookHandler: RequestHandler = async (req: Request, res: Response) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : ''
  if (!raw) {
    res.status(400).json({ success: false, error: 'Empty webhook body' })
    return
  }

  // Hex HMAC-SHA512 of the raw body, keyed with the Paystack secret key — verified once, here.
  const signature = req.headers['x-paystack-signature']
  if (!verifyWebhookSignature(raw, typeof signature === 'string' ? signature : undefined)) {
    logger.warn('[PaystackWebhook] signature verification failed')
    res.status(401).json({ success: false, error: 'Invalid signature' })
    return
  }

  let body: PaystackEventBody
  try {
    body = JSON.parse(raw) as PaystackEventBody
    if (!body || typeof body !== 'object') throw new Error('not an object')
  } catch {
    res.status(400).json({ success: false, error: 'Malformed webhook body' })
    return
  }

  try {
    const outcome = await trackInFlight((async () => processPaystackEvent(await recordPaystackEvent(raw, body)))())
    // 'in_progress': another delivery holds the lease. The event is stored,
    // and that delivery (or the sweep) finishes it.
    res.status(200).json({ success: true, ...(outcome === 'processed' ? {} : { message: outcome }) })
  } catch (err) {
    logger.error(`[PaystackWebhook] ${body.event ?? 'event'} processing failed: ${(err as Error).message} — stored for retry`)
    res.status(500).json({ success: false, error: 'Could not process the event' })
  }
}

const router = Router()
router.post('/', rawBody, paystackWebhookHandler)

export default router

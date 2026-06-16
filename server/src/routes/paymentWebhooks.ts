/**
 * Payment provider webhook routes.
 *
 * Each route uses `express.raw({ type: '*\/*' })` so the raw bytes are
 * available for signature verification. We deliberately AVOID `express.json()`
 * here. The router is mounted at `/api/webhooks/payments` BEFORE the global
 * JSON middleware in `index.ts`.
 *
 * Flow per route:
 *   1. Resolve the live adapter for the provider.
 *   2. Adapter verifies the signature against the raw body.
 *   3. Adapter parses the body into our normalized `WebhookEvent`.
 *   4. `finalizePayment` updates the Payment idempotently and fires hooks.
 */

import { Router, type Request, type Response } from 'express'
import express from 'express'
import { mtnMomoProvider } from '../services/payments/mtnMomo.js'
import { telecelCashProvider } from '../services/payments/telecelCash.js'
import { airtelTigoMoneyProvider } from '../services/payments/airteltigoMoney.js'
import { bankTransferProvider } from '../services/payments/bankTransfer.js'
import { finalizePayment } from '../services/payments/finalize.js'
import type { PaymentProvider } from '../services/payments/types.js'

const router = Router()

// Route-local raw body parser so signature verification can use exact bytes.
const rawBody = express.raw({ type: '*/*', limit: '256kb' })

function flattenHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') out[k] = v
    else if (Array.isArray(v)) out[k] = v.join(',')
  }
  return out
}

function makeHandler(provider: PaymentProvider) {
  return async (req: Request, res: Response) => {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : ''
    if (!raw) {
      res.status(400).json({ success: false, error: 'Empty webhook body' })
      return
    }
    const headers = flattenHeaders(req)

    if (!provider.verifyWebhook(raw, headers)) {
      console.warn(`[Webhook:${provider.id}] signature verification failed`)
      res.status(401).json({ success: false, error: 'Invalid signature' })
      return
    }

    let event
    try {
      event = provider.parseWebhook(raw)
    } catch (err) {
      console.warn(`[Webhook:${provider.id}] parse failed:`, (err as Error).message)
      res.status(400).json({ success: false, error: 'Malformed webhook payload' })
      return
    }

    try {
      await finalizePayment(event, { source: 'webhook' })
    } catch (err) {
      console.error(`[Webhook:${provider.id}] finalize threw:`, (err as Error).message)
      // Still ack 200 so the provider doesn't retry on our internal bug —
      // we have the raw body in logs and will reconcile via cron.
    }
    res.status(200).json({ success: true })
  }
}

router.post('/mtn-momo', rawBody, makeHandler(mtnMomoProvider))
router.post('/telecel', rawBody, makeHandler(telecelCashProvider))
router.post('/airteltigo', rawBody, makeHandler(airtelTigoMoneyProvider))
router.post('/bank', rawBody, makeHandler(bankTransferProvider))

export default router

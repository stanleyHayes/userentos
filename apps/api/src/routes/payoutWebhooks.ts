/**
 * Older path: POST /api/webhooks/payouts/paystack.
 *
 * An alias of the single Paystack webhook (routes/paystackWebhooks.ts), kept
 * so a dashboard still pointing here keeps working. It used to acknowledge
 * every non-transfer event as ignored — including every charge — which, with
 * render.yaml pointing Paystack here, dropped all collection webhooks.
 */
import { Router } from 'express'
import { paystackWebhookHandler, rawBody } from './paystackWebhooks.js'

const router = Router()
router.post('/paystack', rawBody, paystackWebhookHandler)

export default router

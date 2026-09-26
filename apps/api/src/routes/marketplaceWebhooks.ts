/**
 * Older path: POST /api/webhooks/marketplace/paystack.
 *
 * An alias of the single Paystack webhook (routes/paystackWebhooks.ts), kept
 * so a dashboard still pointing here keeps working. It used to handle charges
 * only and dropped every transfer event.
 */
import { Router } from 'express'
import { paystackWebhookHandler, rawBody } from './paystackWebhooks.js'

const router = Router()
router.post('/paystack', rawBody, paystackWebhookHandler)

export default router

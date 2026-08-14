/**
 * Payout provider webhook route.
 *
 * Same shape as `paymentWebhooks.ts`: `express.raw()` so signature verification
 * hashes the exact bytes the PSP sent, mounted BEFORE the global JSON parser.
 *
 * Paystack sends every event type to one URL, so non-transfer events (charges,
 * subscriptions) arrive here too. Those are acknowledged with 200 and ignored —
 * anything else and the PSP would retry them forever.
 */

import { Router, type Request, type Response } from 'express'
import express from 'express'
import { getPayoutProvider } from '../services/payouts/index.js'
import { finalizePayout } from '../services/payouts/finalize.js'
import { logger } from '../utils/logger.js'

const router = Router()

const rawBody = express.raw({ type: '*/*', limit: '256kb' })

function flattenHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') out[k] = v
    else if (Array.isArray(v)) out[k] = v.join(',')
  }
  return out
}

router.post('/paystack', rawBody, async (req: Request, res: Response) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : ''
  if (!raw) {
    res.status(400).json({ success: false, error: 'Empty webhook body' })
    return
  }

  const provider = getPayoutProvider()
  if (!provider.verifyWebhook(raw, flattenHeaders(req))) {
    logger.warn('[PayoutWebhook] signature verification failed')
    res.status(401).json({ success: false, error: 'Invalid signature' })
    return
  }

  let event
  try {
    event = provider.parseWebhook(raw)
  } catch (err) {
    // Verified, but not a transfer event — acknowledge so it is not retried.
    logger.info(`[PayoutWebhook] ignoring event: ${(err as Error).message}`)
    res.status(200).json({ success: true, message: 'Event ignored' })
    return
  }

  try {
    await finalizePayout(event, { source: 'webhook' })
  } catch (err) {
    // 500 asks the PSP to retry, which is what we want when our own write failed.
    logger.error(`[PayoutWebhook] finalize threw: ${(err as Error).message}`)
    res.status(500).json({ success: false, error: 'Could not process the event' })
    return
  }

  res.status(200).json({ success: true })
})

export default router

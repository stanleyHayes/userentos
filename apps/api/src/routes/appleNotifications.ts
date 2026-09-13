import { Router } from 'express'
import { AppleNotificationError, processAppleNotification } from '../services/storeBilling/appleNotifications.js'
import { StoreVerificationError } from '../services/storeBilling/googlePlay.js'
const router = Router()
router.post('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    await processAppleNotification(req.body)
    res.status(204).end()
  } catch (error) {
    const status = error instanceof AppleNotificationError ? error.status
      : error instanceof StoreVerificationError && ['invalid_purchase', 'test_purchase'].includes(error.code) ? 400 : 503
    if (status === 503) res.setHeader('Retry-After', '30')
    // Signed payloads and provider errors must not reach generic error logging.
    res.status(status).json({ error: 'Apple notification could not be processed' })
  }
})
export default router

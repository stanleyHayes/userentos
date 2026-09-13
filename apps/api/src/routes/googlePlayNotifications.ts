import { Router } from 'express'
import { authenticateGoogleNotification, processGoogleNotification, GoogleNotificationError } from '../services/storeBilling/googleNotifications.js'

const router = Router()
router.post('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    await authenticateGoogleNotification(req.get('authorization'))
    await processGoogleNotification(req.body)
    res.status(204).end()
  } catch (error) {
    // Do not pass provider errors to the global logger: they may carry tokens.
    res.status(error instanceof GoogleNotificationError ? error.status : 503).json({ error: 'Google notification could not be processed' })
  }
})
export default router

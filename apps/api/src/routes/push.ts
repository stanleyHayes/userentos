import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { registerDeviceToken, unregisterDeviceToken, webPushPublicKey } from '../services/push.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { registerPushSchema, unregisterPushSchema, webPushSubscriptionSchema } from '../services/push/input.js'
import { success } from '../utils/response.js'

const router = Router()

/** The VAPID public key a browser subscribes with; null when browser notifications are not set up. */
router.get('/web-key', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600')
  success(res, { publicKey: webPushPublicKey() })
})

function validWebSubscription(token: string): boolean {
  try {
    return webPushSubscriptionSchema.safeParse(JSON.parse(token)).success
  } catch {
    return false
  }
}

router.post('/register', authenticate, asyncHandler(async (req, res) => {
  const parsed = registerPushSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Invalid push registration' }); return }
  const { token, platform } = parsed.data
  if (platform === 'webpush' && !validWebSubscription(token)) { res.status(400).json({ error: 'Invalid browser push subscription' }); return }
  await registerDeviceToken(req.user!.userId, token, platform)
  success(res, null, 'Device registered for push notifications')
}))

router.post('/unregister', authenticate, asyncHandler(async (req, res) => {
  const parsed = unregisterPushSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Invalid device token' }); return }
  const { token } = parsed.data
  await unregisterDeviceToken(req.user!.userId, token)
  success(res, null, 'Device unregistered')
}))

export default router

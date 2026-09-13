import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { registerDeviceToken, unregisterDeviceToken } from '../services/push.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { registerPushSchema, unregisterPushSchema } from '../services/push/input.js'
import { success } from '../utils/response.js'

const router = Router()

router.post('/register', authenticate, asyncHandler(async (req, res) => {
  const parsed = registerPushSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Invalid push registration' }); return }
  const { token, platform } = parsed.data
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

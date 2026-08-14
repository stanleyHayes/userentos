import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { registerDeviceToken, unregisterDeviceToken } from '../services/push.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { success } from '../utils/response.js'

const router = Router()

router.post('/register', authenticate, asyncHandler(async (req, res) => {
  const { token, platform } = req.body as { token?: string; platform?: 'expo' | 'fcm' | 'apns' }
  if (!token) { res.status(400).json({ error: 'Token required' }); return }
  await registerDeviceToken(req.user!.userId, token, platform)
  success(res, null, 'Device registered for push notifications')
}))

router.post('/unregister', authenticate, asyncHandler(async (req, res) => {
  const { token } = req.body as { token?: string }
  if (!token) { res.status(400).json({ error: 'Token required' }); return }
  await unregisterDeviceToken(req.user!.userId, token)
  success(res, null, 'Device unregistered')
}))

export default router

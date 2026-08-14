import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { User } from '../models/User.js'
import { success, error } from '../utils/response.js'

const router = Router()

interface UserSettings {
  theme?: string
  language?: string
  notifications?: Record<string, boolean>
}

// Get user settings
router.get('/', authenticate, async (req, res) => {
  const user = await User.findById(req.user!.userId).lean()
  if (!user) { error(res, 'User not found', 404); return }

  const defaults = {
    theme: 'system' as const,
    language: 'en',
    notifications: { email: true, sms: true, push: true, payment: true, savings: true },
  }

  success(res, (user as unknown as { settings?: UserSettings }).settings ?? defaults)
})

// Update user settings
router.patch('/', authenticate, async (req, res) => {
  const user = await User.findById(req.user!.userId)
  if (!user) { error(res, 'User not found', 404); return }

  const { theme, language, notifications } = req.body
  const settings = (user as unknown as { settings?: UserSettings }).settings ?? {
    theme: 'system',
    language: 'en',
    notifications: { email: true, sms: true, push: true, payment: true, savings: true },
  }

  if (theme) settings.theme = theme
  if (language) settings.language = language
  if (notifications) settings.notifications = { ...settings.notifications, ...notifications }

  ;(user as unknown as { settings: UserSettings }).settings = settings
  await user.save()

  success(res, settings)
})

export default router

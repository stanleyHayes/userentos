import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { User } from '../models/User.js'
import { success, error } from '../utils/response.js'

const router = Router()
const notificationSchema = z.object({
  email: z.boolean().optional(), sms: z.boolean().optional(), push: z.boolean().optional(),
  payment: z.boolean().optional(), savings: z.boolean().optional(),
}).strict()
const settingsPatch = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  language: z.enum(['en', 'tw', 'ga', 'ee']).optional(),
  notifications: notificationSchema.optional(),
}).strict().refine(value => value.theme !== undefined || value.language !== undefined || Object.keys(value.notifications ?? {}).length > 0, 'Provide at least one settings change')

function settingsWithDefaults(settings?: { theme?: string; language?: string; notifications?: Partial<Record<'email' | 'sms' | 'push' | 'payment' | 'savings', boolean>> }) {
  return {
    theme: settings?.theme ?? 'system',
    language: settings?.language ?? 'en',
    notifications: { email: true, sms: true, push: true, payment: true, savings: true, ...settings?.notifications },
  }
}

router.get('/', authenticate, async (req, res) => {
  const user = await User.findById(req.user!.userId).select('settings').lean()
  if (!user) { error(res, 'User not found', 404); return }
  success(res, settingsWithDefaults(user.settings))
})

router.patch('/', authenticate, async (req, res) => {
  const parsed = settingsPatch.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const changes: Record<string, string | boolean> = {}
  if (parsed.data.theme !== undefined) changes['settings.theme'] = parsed.data.theme
  if (parsed.data.language !== undefined) changes['settings.language'] = parsed.data.language
  for (const [key, value] of Object.entries(parsed.data.notifications ?? {})) {
    if (value !== undefined) changes[`settings.notifications.${key}`] = value
  }
  // Disjoint preference updates must not replace each other's settings snapshot.
  const user = await User.findOneAndUpdate(
    { _id: req.user!.userId, deletedAt: { $exists: false } },
    { $set: changes },
    { new: true, runValidators: true },
  ).select('settings').lean()
  if (!user) { error(res, 'User not found', 404); return }
  success(res, settingsWithDefaults(user.settings))
})

export default router

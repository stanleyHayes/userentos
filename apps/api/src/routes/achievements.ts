import { Router, type Request, type Response } from 'express'
import type { Types } from 'mongoose'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { Achievement } from '../models/Achievement.js'
import { PaymentStreak } from '../models/PaymentStreak.js'
import { User } from '../models/User.js'
import { success } from '../utils/response.js'
import type { AchievementTier } from '../types/index.js'

const router = Router()

router.get('/mine', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId
  const items = await Achievement.find({ userId }).sort({ earnedAt: -1 }).lean()
  success(res, {
    items: items.map((a) => ({
      ...a,
      id: (a._id as Types.ObjectId).toString(),
    })),
    total: items.length,
  })
}))

router.get('/streak', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId
  const streak = await PaymentStreak.findOne({ userId }).lean()
  if (!streak) {
    success(res, {
      userId,
      currentStreak: 0,
      longestStreak: 0,
      breaks: [],
    })
    return
  }
  success(res, {
    ...streak,
    id: (streak._id as Types.ObjectId).toString(),
  })
}))

router.get('/leaderboard', authenticate, asyncHandler(async (_req: Request, res: Response) => {
  const top = await PaymentStreak.find({ longestStreak: { $gt: 0 } })
    .sort({ longestStreak: -1, currentStreak: -1 })
    .limit(20)
    .lean()

  const userIds = top.map((s) => s.userId)
  const users = await User.find({ _id: { $in: userIds } }).select('firstName lastName').lean()
  const userMap = new Map(users.map((u) => [(u._id as Types.ObjectId).toString(), u]))

  function tierFor(longest: number): AchievementTier {
    if (longest >= 24) return 'platinum'
    if (longest >= 12) return 'gold'
    if (longest >= 6) return 'silver'
    return 'bronze'
  }

  const items = top.map((s) => {
    const u = userMap.get(s.userId)
    const firstName = u?.firstName ?? 'Anonymous'
    const lastInitial = u?.lastName?.[0] ?? ''
    return {
      userId: s.userId,
      displayName: lastInitial ? `${firstName} ${lastInitial}.` : firstName,
      longestStreak: s.longestStreak,
      currentStreak: s.currentStreak,
      tier: tierFor(s.longestStreak),
    }
  })

  success(res, { items, total: items.length })
}))

export default router

import { Router, Request, Response } from 'express'
import type { Types } from 'mongoose'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { chatController } from '../controllers/chatController.js'
import { User } from '../models/User.js'
import { success } from '../utils/response.js'

const router = Router()

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Lightweight user search for starting new conversations — any authenticated user can access
router.get('/users', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId
  const search = (req.query.search as string || '').trim()

  const filter: Record<string, unknown> = { _id: { $ne: userId } }
  if (search) {
    const escaped = escapeRegex(search)
    const regex = new RegExp(escaped, 'i')
    filter.$or = [
      { firstName: regex },
      { lastName: regex },
      { email: regex },
    ]
  }

  const users = await User.find(filter)
    .select('firstName lastName email activeRole')
    .limit(30)
    .lean()

  const items = users.map((u) => ({
    id: (u._id as Types.ObjectId).toString(),
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    activeRole: u.activeRole,
  }))

  success(res, { items })
}))

router.get('/conversations', authenticate, asyncHandler(chatController.listConversations))
router.post('/conversations', authenticate, asyncHandler(chatController.createConversation))
router.get('/conversations/:id/messages', authenticate, asyncHandler(chatController.getMessages))
router.post('/conversations/:id/messages', authenticate, asyncHandler(chatController.sendMessage))
router.patch('/conversations/:id/read', authenticate, asyncHandler(chatController.markRead))
router.get('/unread-count', authenticate, asyncHandler(chatController.unreadCount))

export default router

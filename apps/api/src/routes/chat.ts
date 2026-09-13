import { Router, Request, Response } from 'express'
import type { Types } from 'mongoose'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { chatController } from '../controllers/chatController.js'
import { User } from '../models/User.js'
import { success, error } from '../utils/response.js'
import { UserBlock } from '../models/UserBlock.js'
import { blockedContacts } from '../services/userBlocks.js'
import { param } from '../utils/params.js'
import { isValidObjectId } from 'mongoose'
import { getIO } from '../services/socket.js'
import { Conversation } from '../models/Conversation.js'

const router = Router()

router.put('/blocks/:userId', authenticate, asyncHandler(async (req, res) => {
  const target = param(req.params.userId)
  const owner = req.user!.userId
  if (!isValidObjectId(target) || target === owner) { error(res, 'Invalid user'); return }
  if (!await User.exists({ _id: target, deletedAt: { $exists: false } })) { error(res, 'User not found', 404); return }
  await UserBlock.updateOne({ blockerId: owner, blockedId: target }, { $setOnInsert: { blockerId: owner, blockedId: target } }, { upsert: true })
  const conversations = await Conversation.find({ participants: { $all: [owner, target] } }).select('_id').lean()
  try {
    const io = getIO()
    for (const conversation of conversations) io.in(`chat:${conversation._id}`).socketsLeave(`chat:${conversation._id}`)
    io.to(`user:${owner}`).emit('contact:changed', { userId: target })
    io.to(`user:${target}`).emit('contact:changed', { userId: owner })
  } catch { /* HTTP enforcement remains authoritative when realtime is unavailable. */ }
  success(res, null, 'User blocked. Neither of you can send messages until the block is removed.')
}))

router.delete('/blocks/:userId', authenticate, asyncHandler(async (req, res) => {
  const owner = req.user!.userId
  const target = param(req.params.userId)
  await UserBlock.deleteOne({ blockerId: owner, blockedId: target })
  try {
    getIO().to(`user:${owner}`).emit('contact:changed', { userId: target })
    getIO().to(`user:${target}`).emit('contact:changed', { userId: owner })
  } catch { /* Clients can also refresh over HTTP. */ }
  success(res, null, 'Your block was removed.')
}))

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Lightweight user search for starting new conversations — any authenticated user can access.
// Requires a ≥2-char search term and never returns emails, so it can't be abused
// as a user directory / email enumeration endpoint.
router.get('/users', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId
  const search = (req.query.search as string || '').trim()

  if (search.length < 2) {
    error(res, 'Search query must be at least 2 characters')
    return
  }

  const escaped = escapeRegex(search)
  const regex = new RegExp(escaped, 'i')
  const filter: Record<string, unknown> = {
    _id: { $nin: [userId, ...await blockedContacts(userId)] },
    deletedAt: { $exists: false },
    suspendedAt: { $exists: false },
    $or: [
      { firstName: regex },
      { lastName: regex },
    ],
  }

  const users = await User.find(filter)
    .select('firstName lastName activeRole')
    .limit(20)
    .lean()

  const items = users.map((u) => ({
    id: (u._id as Types.ObjectId).toString(),
    firstName: u.firstName,
    lastName: u.lastName,
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

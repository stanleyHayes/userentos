import { Request, Response } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { Conversation, Message } from '../models/Conversation.js'
import { User } from '../models/User.js'
import { Property } from '../models/Property.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { contactBlocked, blockedContacts } from '../services/userBlocks.js'
import { UserBlock } from '../models/UserBlock.js'
import { sendMessage, sendFailureBody, clearUnreadEmail } from '../services/conversations.js'

const createConversationSchema = z.object({
  participantId: z.string().min(1),
  propertyId: z.string().optional(),
})

const sendMessageSchema = z.object({
  text: z.string().min(1).max(2000),
})

export const chatController = {
  listConversations: async (req: Request, res: Response) => {
    const userId = req.user!.userId

    const blocked = await blockedContacts(userId)
    const myBlocks = new Set((await UserBlock.find({ blockerId: userId }).lean()).map(block => block.blockedId))

    const conversations = await Conversation.find({ participants: userId })
      .sort({ updatedAt: -1 })
      .lean()

    // Gather other-user IDs and property IDs to batch-lookup
    const otherUserIds = conversations.map((c) => {
      const other = c.participants.find((p: string) => p !== userId)
      return other ?? c.participants[0]
    })
    const propertyIds = conversations.map((c) => c.propertyId).filter((id): id is string => !!id)

    const [users, properties] = await Promise.all([
      User.find({ _id: { $in: otherUserIds } }).select('firstName lastName').lean(),
      propertyIds.length > 0 ? Property.find({ _id: { $in: propertyIds } }).select('title').lean() : Promise.resolve([]),
    ])

    const userMap = new Map(users.map((u) => [(u._id as Types.ObjectId).toString(), u]))
    const propMap = new Map(properties.map((p) => [(p._id as Types.ObjectId).toString(), p]))

    const items = conversations.map((c) => {
      const otherId = c.participants.find((p: string) => p !== userId) ?? c.participants[0]
      const otherUser = userMap.get(otherId)
      const property = c.propertyId ? propMap.get(c.propertyId) : undefined
      const unread = c.unreadCount instanceof Map ? c.unreadCount.get(userId) : (c.unreadCount as Record<string, number>)?.[userId]

      return {
        id: (c._id as Types.ObjectId).toString(),
        participants: c.participants,
        contactBlocked: blocked.has(otherId),
        blockedByMe: myBlocks.has(otherId),
        otherUser: otherUser ? { id: otherId, firstName: otherUser.firstName, lastName: otherUser.lastName } : undefined,
        propertyId: c.propertyId,
        propertyTitle: property?.title,
        lastMessage: c.lastMessage ? {
          text: c.lastMessage.text,
          senderId: c.lastMessage.senderId,
          createdAt: c.lastMessage.createdAt?.toISOString?.() ?? c.lastMessage.createdAt,
        } : undefined,
        unreadCount: unread ?? 0,
        createdAt: (c as unknown as { createdAt: string }).createdAt,
        updatedAt: (c as unknown as { updatedAt: string }).updatedAt,
      }
    })

    success(res, items)
  },

  createConversation: async (req: Request, res: Response) => {
    const parsed = createConversationSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    const userId = req.user!.userId
    const { participantId, propertyId } = parsed.data

    if (participantId === userId) { error(res, 'Cannot message yourself'); return }
    if (await contactBlocked(userId, participantId)) { error(res, 'Messaging is unavailable for this contact.', 403); return }

    // Participant must be an existing user
    const otherUser = await User.findOne({ _id: participantId, deletedAt: { $exists: false }, suspendedAt: { $exists: false } }).select('firstName lastName').lean()
    if (!otherUser) { error(res, 'Participant not found', 404); return }

    // Check if conversation already exists between these two users (optionally for same property)
    const query: Record<string, unknown> = {
      participants: { $all: [userId, participantId] },
    }
    if (propertyId) query.propertyId = propertyId

    let conversation = await Conversation.findOne(query).lean()
    let isNew = false

    if (!conversation) {
      const created = await Conversation.create({
        participants: [userId, participantId],
        propertyId,
        unreadCount: new Map([[userId, 0], [participantId, 0]]),
      })
      conversation = created.toObject()
      isNew = true
    }

    // Populate other user info (already validated above)
    const result = {
      id: (conversation._id as Types.ObjectId).toString(),
      participants: conversation.participants,
      otherUser: { id: participantId, firstName: otherUser.firstName, lastName: otherUser.lastName },
      propertyId: conversation.propertyId,
      lastMessage: conversation.lastMessage ? {
        text: conversation.lastMessage.text,
        senderId: conversation.lastMessage.senderId,
        createdAt: conversation.lastMessage.createdAt?.toISOString?.() ?? conversation.lastMessage.createdAt,
      } : undefined,
      unreadCount: 0,
      createdAt: (conversation as unknown as { createdAt: string }).createdAt,
      updatedAt: (conversation as unknown as { updatedAt: string }).updatedAt,
    }

    success(res, result, 'Conversation ready', isNew ? 201 : 200)
  },

  getMessages: async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const conversationId = param(req.params.id)

    // Verify user is participant
    const conversation = await Conversation.findById(conversationId).lean()
    if (!conversation || !conversation.participants.includes(userId)) {
      error(res, 'Conversation not found', 404); return
    }

    const page = Math.max(1, Math.floor(Number(req.query.page) || 1))
    // Cap pageSize — unbounded values force massive reads.
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(req.query.pageSize) || 50)))
    const skip = (page - 1) * pageSize

    /*
     * Page backwards from the newest message.
     *
     * This sorted OLDEST first and the client never paged, so opening a
     * conversation with 200 messages showed the first 50 — the beginning of
     * the history — and the recent messages were unreachable. A chat has to
     * open at the bottom.
     *
     * So: select descending (page 1 = the 50 most recent, page 2 = the 50
     * before those), then reverse for the response so the client still
     * receives them in chronological order and needs no change.
     */
    const [newestFirst, total] = await Promise.all([
      Message.find({ conversationId })
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Message.countDocuments({ conversationId }),
    ])
    const messages = newestFirst.reverse()

    // Gather sender names
    const senderIds = [...new Set(messages.map((m) => m.senderId))]
    const senders = await User.find({ _id: { $in: senderIds } }).select('firstName lastName').lean()
    const senderMap = new Map(senders.map((s) => [(s._id as Types.ObjectId).toString(), s]))

    const items = messages.map((m) => {
      const sender = senderMap.get(m.senderId)
      return {
        id: (m._id as Types.ObjectId).toString(),
        conversationId: m.conversationId,
        senderId: m.senderId,
        senderName: sender ? `${sender.firstName} ${sender.lastName}` : undefined,
        text: m.removed ? 'Message removed by moderation' : m.text,
        removed: !!m.removed,
        read: m.read,
        createdAt: (m as unknown as { createdAt: string }).createdAt,
      }
    })

    success(res, { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  },

  sendMessage: async (req: Request, res: Response) => {
    const parsed = sendMessageSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    // Blocks, the abuse filter and the contact screen (TRUST-2) all run in
    // services/conversations.ts, the one path every message takes.
    const result = await sendMessage({ conversationId: param(req.params.id), senderId: req.user!.userId, text: parsed.data.text, channel: 'chat' })
    if (!result.ok) { res.status(result.status).json(sendFailureBody(result)); return }
    success(res, result.message, 'Message sent', 201)
  },

  markRead: async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const conversationId = param(req.params.id)

    const conversation = await Conversation.findById(conversationId)
    if (!conversation || !conversation.participants.includes(userId)) {
      error(res, 'Conversation not found', 404); return
    }

    // Mark all messages from the other user as read
    await Message.updateMany(
      { conversationId, senderId: { $ne: userId }, read: false },
      { read: true }
    )

    // Reset unread count for this user; a later unread spell may email again.
    conversation.unreadCount.set(userId, 0)
    await conversation.save()
    await clearUnreadEmail(conversationId, userId)

    success(res, null, 'Marked as read')
  },

  unreadCount: async (req: Request, res: Response) => {
    const userId = req.user!.userId

    const conversations = await Conversation.find({ participants: userId }).select('unreadCount').lean()

    let total = 0
    for (const c of conversations) {
      if (c.unreadCount instanceof Map) {
        total += c.unreadCount.get(userId) ?? 0
      } else {
        total += (c.unreadCount as Record<string, number>)?.[userId] ?? 0
      }
    }

    success(res, { count: total })
  },
}

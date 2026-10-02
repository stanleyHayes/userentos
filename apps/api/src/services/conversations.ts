/**
 * Sending a RentOS message, in one place. The chat composer, a website
 * enquiry and the first message about a listing all go through here, so every
 * message gets the same checks — blocks between the two people, a suspended or
 * closed recipient, the abuse filter and the contact screen (TRUST-2) — and the
 * same alerts: a live toast, a browser or phone notification, and an email if
 * it is still unread a while later (services/messageAlerts.ts).
 */
import type { Types } from 'mongoose'
import { Conversation, Message } from '../models/Conversation.js'
import { User } from '../models/User.js'
import { contactBlocked } from './userBlocks.js'
import { screenText, NEUTRAL_REJECTION, type FilterVerdict } from './moderation/textFilter.js'
import { shouldReport, reportFlaggedContent } from './moderation/autoReport.js'
import { screenOutbound, type TrustChannel } from './trust/screen.js'
import { CONTEXT_WINDOW, type ContextMessage } from './trust/context.js'
import { notifyNewMessage } from './notify.js'
import { getIO } from './socket.js'
import { logger } from '../utils/logger.js'

export const MESSAGING_UNAVAILABLE = 'Messaging is unavailable for this contact.'

export type SendFailure =
  | { ok: false; status: 400 | 403 | 404; message: string; blocked?: undefined }
  /** Stopped by the contact screen: the author keeps their text (TRUST-2 §14). */
  | { ok: false; status: 422; message: string; blocked: true; reason: string | null; decisionId: string | null }

export interface SentMessage {
  id: string
  conversationId: string
  senderId: string
  senderName?: string
  text: string
  read: boolean
  createdAt: Date
}

/** The author's own recent messages in a conversation: the window TRUST-2 reassembles across (§13). */
export async function recentFromAuthor(conversationId: string, authorId: string, now = new Date()): Promise<ContextMessage[]> {
  const rows = await Message.find({
    conversationId,
    senderId: authorId,
    removed: { $ne: true },
    createdAt: { $gte: new Date(now.getTime() - CONTEXT_WINDOW.maxAgeMs) },
  }).sort({ createdAt: -1 }).limit(CONTEXT_WINDOW.maxMessages).select('text createdAt').lean()
  return rows.map((row) => ({ id: String(row._id), text: row.text, createdAt: row.createdAt }))
}

interface OutboundInput {
  senderId: string
  recipientId: string
  text: string
  channel: TrustChannel
  conversationId?: string
}

/** Every check a message passes before anyone sees it. */
async function checkOutbound(input: OutboundInput): Promise<{ ok: true; verdict: FilterVerdict } | SendFailure> {
  const recipientActive = await User.exists({ _id: input.recipientId, deletedAt: { $exists: false }, suspendedAt: { $exists: false } })
  if (!recipientActive || await contactBlocked(input.senderId, input.recipientId)) {
    return { ok: false, status: 403, message: MESSAGING_UNAVAILABLE }
  }
  // Slurs, threats and abuse aimed at the recipient never reach them.
  const verdict = screenText(input.text)
  if (verdict.action === 'reject') return { ok: false, status: 400, message: NEUTRAL_REJECTION }

  const now = new Date()
  const history = input.conversationId ? await recentFromAuthor(input.conversationId, input.senderId, now) : []
  const screened = await screenOutbound({
    text: input.text,
    authorId: input.senderId,
    channel: input.channel,
    conversationId: input.conversationId,
    history,
    now,
  })
  if (!screened.allowed) {
    return { ok: false, status: 422, message: screened.message ?? '', blocked: true, reason: screened.userReason, decisionId: screened.decisionId }
  }
  return { ok: true, verdict }
}

/**
 * Store the message, update the thread, and tell the recipient. `alerted`: the
 * recipient is already being told another way (a new-lead alert with its own
 * email and SMS), so the message adds no second alert or email.
 */
async function deliver(conversationId: string, senderId: string, recipientId: string, text: string, verdict: FilterVerdict, alerted = false): Promise<SentMessage> {
  const message = await Message.create({ conversationId, senderId, text, read: false })
  if (shouldReport(verdict, 'private')) {
    void reportFlaggedContent({ targetType: 'message', targetId: message._id.toString(), ownerId: senderId, label: text, verdict })
  }

  // Atomic $inc: a read-modify-write lost increments under concurrent messages.
  const updated = await Conversation.findOneAndUpdate(
    { _id: conversationId },
    {
      $set: { lastMessage: { text, senderId, createdAt: message.createdAt } },
      $inc: { [`unreadCount.${recipientId}`]: 1 },
    },
    { returnDocument: 'after' },
  ).select('unreadCount').lean()
  const unreadCount = (updated?.unreadCount as Record<string, number> | undefined)?.[recipientId] ?? 1
  await queueUnreadEmail(conversationId, recipientId, message.createdAt, alerted)

  const sender = await User.findById(senderId).select('firstName lastName').lean()
  const senderName = sender ? `${sender.firstName} ${sender.lastName}`.trim() : undefined
  const sent: SentMessage = {
    id: message._id.toString(),
    conversationId,
    senderId,
    senderName,
    text: message.text,
    read: message.read,
    createdAt: message.createdAt,
  }

  try {
    const io = getIO()
    // Whoever has the conversation open sees it at once.
    io.to(`chat:${conversationId}`).emit('message:new', sent)
    io.to(`user:${recipientId}`).emit('unread:update', {
      conversationId,
      unreadCount,
      lastMessage: { text, senderId, createdAt: sent.createdAt },
    })
  } catch { /* the socket layer is best-effort */ }

  // In-app item, live toast and push now; the email waits to see if it is read.
  if (!alerted) {
    notifyNewMessage(recipientId, senderName || 'Someone', text, conversationId)
      .catch((err) => logger.warn('[chat] notifyNewMessage failed:', (err as Error).message))
  }

  return sent
}

/**
 * Line up the "you have unread messages" email (services/messageAlerts.ts):
 * once per unread spell. When the recipient was already emailed another way
 * (a new-lead alert), the spell counts as emailed. Bookkeeping only, so the
 * conversation's place in the inbox (updatedAt) is left alone.
 */
async function queueUnreadEmail(conversationId: string, recipientId: string, since: Date, alerted: boolean): Promise<void> {
  try {
    if (alerted) {
      await Conversation.updateOne({ _id: conversationId }, { $addToSet: { emailedUnread: recipientId }, $pull: { pendingEmail: { userId: recipientId } } }, { timestamps: false })
    } else {
      await Conversation.updateOne(
        { _id: conversationId, 'pendingEmail.userId': { $ne: recipientId }, emailedUnread: { $ne: recipientId } },
        { $push: { pendingEmail: { userId: recipientId, since } } },
        { timestamps: false },
      )
    }
  } catch (err) {
    logger.warn(`[chat] could not queue the unread-message email: ${(err as Error).message}`)
  }
}

/** Reading a conversation ends the unread spell: a later message may email again. */
export async function clearUnreadEmail(conversationId: string, userId: string): Promise<void> {
  await Conversation.updateOne({ _id: conversationId }, { $pull: { pendingEmail: { userId }, emailedUnread: userId } }, { timestamps: false })
}

/** Send a message in an existing conversation the sender belongs to. */
export async function sendMessage(input: { conversationId: string; senderId: string; text: string; channel?: TrustChannel }): Promise<{ ok: true; message: SentMessage } | SendFailure> {
  const conversation = await Conversation.findById(input.conversationId).select('participants').lean()
  if (!conversation || !conversation.participants.includes(input.senderId)) {
    return { ok: false, status: 404, message: 'Conversation not found' }
  }
  const recipientId = conversation.participants.find((p) => p !== input.senderId)
  if (!recipientId) return { ok: false, status: 403, message: MESSAGING_UNAVAILABLE }

  const checked = await checkOutbound({ senderId: input.senderId, recipientId, text: input.text, channel: input.channel ?? 'chat', conversationId: input.conversationId })
  if (!checked.ok) return checked
  const message = await deliver(input.conversationId, input.senderId, recipientId, input.text, checked.verdict)
  return { ok: true, message }
}

/** The conversation between two people about a listing (or in general), if there is one. */
export async function findConversation(a: string, b: string, propertyId?: string) {
  return Conversation.findOne({
    participants: { $all: [a, b] },
    ...(propertyId ? { propertyId } : { propertyId: { $exists: false } }),
  }).select('_id participants').lean()
}

/**
 * An enquiry from a listing or a website opens (or continues) a conversation
 * with the agent. The message is screened before anything is created, so a
 * stopped enquiry leaves no empty conversation behind.
 */
export async function openEnquiryConversation(input: {
  senderId: string
  recipientId: string
  propertyId?: string
  text: string
  channel: 'website' | 'interest' | 'whatsapp'
  /** A new-lead alert (with email and SMS) already tells the agent; skip the message alert. */
  alerted?: boolean
}): Promise<{ ok: true; conversationId: string; messageId: string } | SendFailure> {
  if (input.senderId === input.recipientId) return { ok: false, status: 400, message: 'You cannot message yourself' }
  const existing = await findConversation(input.senderId, input.recipientId, input.propertyId)
  const existingId = existing ? (existing._id as Types.ObjectId).toString() : undefined

  const checked = await checkOutbound({ senderId: input.senderId, recipientId: input.recipientId, text: input.text, channel: 'enquiry', conversationId: existingId })
  if (!checked.ok) return checked

  let conversationId = existingId
  if (!conversationId) {
    const created = await Conversation.create({
      participants: [input.senderId, input.recipientId],
      propertyId: input.propertyId,
      unreadCount: new Map([[input.senderId, 0], [input.recipientId, 0]]),
    })
    conversationId = created._id.toString()
  }
  const message = await deliver(conversationId, input.senderId, input.recipientId, input.text, checked.verdict, input.alerted)
  return { ok: true, conversationId, messageId: message.id }
}

/** The JSON body for a failed send: a 422 carries what the composer needs to keep the text and explain. */
export function sendFailureBody(failure: SendFailure) {
  return failure.blocked
    ? { success: false, error: failure.message, blocked: true, reason: failure.reason, decisionId: failure.decisionId }
    : { success: false, error: failure.message }
}

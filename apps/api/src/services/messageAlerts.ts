/**
 * "You have unread messages" emails, the way LinkedIn does it. A new message
 * alerts at once — a live toast in the app, a browser notification and a push
 * to the phone (services/conversations.ts). If it is still unread a while
 * later, one email goes out for the conversation, and no more about that
 * conversation until the person has read it.
 *
 * The email follows the person's email toggle (Settings → Notifications), and
 * never goes to a closed or suspended account. The wait is
 * MESSAGE_EMAIL_DELAY_MINUTES (default 30).
 */
import type { Types } from 'mongoose'
import { Conversation } from '../models/Conversation.js'
import { User } from '../models/User.js'
import { Property } from '../models/Property.js'
import { sendEmail, absoluteUrl } from './email.js'
import { renderEmail } from './emailLayout.js'
import { deliveryPlan, emailFooter, conversationPath, type NotificationPreferences } from './notify.js'
import { logger } from '../utils/logger.js'

export const DEFAULT_DELAY_MINUTES = 30
/** Unread messages older than this are not emailed about (after an outage, say). */
const LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000
const BATCH = 200

export function messageEmailDelayMs(): number {
  const raw = Number(process.env.MESSAGE_EMAIL_DELAY_MINUTES)
  const minutes = Number.isFinite(raw) && raw >= 1 && raw <= 24 * 60 ? raw : DEFAULT_DELAY_MINUTES
  return minutes * 60 * 1000
}

export interface UnreadEmail {
  subject: string
  text: string
  html: string
}

/** The email itself; pure, for the tests. */
export function unreadEmail(input: { firstName?: string; senderName: string; unread: number; preview: string; propertyTitle?: string; url: string }): UnreadEmail {
  const count = input.unread > 1 ? `${input.unread} new messages` : 'a new message'
  const about = input.propertyTitle ? ` about "${input.propertyTitle}"` : ''
  const preview = input.preview.length > 200 ? `${input.preview.slice(0, 199).trimEnd()}…` : input.preview
  const subject = input.unread > 1 ? `${input.unread} unread messages from ${input.senderName}` : `${input.senderName} sent you a message`
  const email = renderEmail({
    preheader: `${input.senderName}: ${preview}`,
    heading: input.unread > 1 ? `${input.unread} unread messages from ${input.senderName}` : `New message from ${input.senderName}`,
    paragraphs: [`${input.firstName ? `Hi ${input.firstName}, ` : ''}${input.senderName} sent you ${count}${about} on RentOS.`],
    highlight: { label: input.unread > 1 ? 'Latest message' : 'Message', text: preview },
    button: { label: 'Reply on RentOS', url: input.url },
    footer: emailFooter('account'),
  })
  return { subject, ...email }
}

/** One run: email everyone whose unread message has waited long enough. */
export async function sendUnreadMessageEmails(now = new Date()): Promise<{ examined: number; emailed: number }> {
  const cutoff = new Date(now.getTime() - messageEmailDelayMs())
  const oldest = new Date(now.getTime() - LOOKBACK_MS)

  // Too old to be worth an email: drop it without sending.
  await Conversation.updateMany(
    { 'pendingEmail.since': { $lt: oldest } },
    { $pull: { pendingEmail: { since: { $lt: oldest } } } },
    { timestamps: false },
  )

  const due = await Conversation.find({ 'pendingEmail.since': { $lte: cutoff } })
    .select('participants propertyId lastMessage unreadCount pendingEmail')
    .sort({ 'pendingEmail.since': 1 }).limit(BATCH).lean()

  let emailed = 0
  for (const conversation of due) {
    const conversationId = (conversation._id as Types.ObjectId).toString()
    for (const pending of conversation.pendingEmail ?? []) {
      if (pending.since > cutoff) continue
      // Claim it: another instance running the job cannot send it twice.
      const claimed = await Conversation.updateOne(
        { _id: conversation._id, pendingEmail: { $elemMatch: { userId: pending.userId, since: { $lte: cutoff } } } },
        { $pull: { pendingEmail: { userId: pending.userId } }, $addToSet: { emailedUnread: pending.userId } },
        { timestamps: false },
      )
      if (!claimed.modifiedCount) continue
      try {
        if (await emailOne(conversationId, conversation, pending.userId)) emailed++
      } catch (err) {
        logger.warn(`[messageAlerts] email for conversation ${conversationId} failed: ${(err as Error).message}`)
      }
    }
  }
  return { examined: due.length, emailed }
}

async function emailOne(
  conversationId: string,
  conversation: { participants: string[]; propertyId?: string; lastMessage?: { text?: string; senderId?: string }; unreadCount?: unknown },
  userId: string,
): Promise<boolean> {
  const unreadMap = conversation.unreadCount as Record<string, number> | Map<string, number> | undefined
  const unread = unreadMap instanceof Map ? unreadMap.get(userId) ?? 0 : unreadMap?.[userId] ?? 0
  // Read in the meantime, or the last word was their own.
  if (unread <= 0 || !conversation.lastMessage?.text || conversation.lastMessage.senderId === userId) return false

  const recipient = await User.findOne({ _id: userId, deletedAt: { $exists: false }, suspendedAt: { $exists: false } })
    .select('email firstName settings.notifications').lean()
  if (!recipient?.email) return false
  const plan = deliveryPlan('account', (recipient.settings?.notifications ?? {}) as NotificationPreferences)
  if (!plan.email) return false

  const senderId = conversation.lastMessage.senderId ?? conversation.participants.find((p) => p !== userId)
  const [sender, property] = await Promise.all([
    senderId ? User.findById(senderId).select('firstName lastName').lean() : null,
    conversation.propertyId ? Property.findById(conversation.propertyId).select('title').lean() : null,
  ])
  const email = unreadEmail({
    firstName: recipient.firstName,
    senderName: sender ? `${sender.firstName} ${sender.lastName}`.trim() : 'Someone',
    unread,
    preview: conversation.lastMessage.text,
    propertyTitle: (property as { title?: string } | null)?.title,
    url: absoluteUrl(conversationPath(conversationId)),
  })
  return sendEmail({ to: recipient.email, ...email })
}

/**
 * Unified notification service.
 * Sends in_app notification (always) + email (when available) + push (when available).
 */

import { Notification } from '../models/Notification.js'
import { User } from '../models/User.js'
import { sendEmail } from './email.js'
import { sendPushNotification } from './push.js'
import { getIO } from './socket.js'

interface NotifyOptions {
  userId: string
  title: string
  message: string
  actionUrl?: string
  /** Skip email for this notification */
  skipEmail?: boolean
  /** Skip push for this notification */
  skipPush?: boolean
}

/** Escape user-controlled values before interpolating into email HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Send notification across all channels:
 * 1. Always creates in_app notification
 * 2. Sends email if user email is available
 * 3. Sends push notification if device tokens are registered
 */
export async function notify(opts: NotifyOptions) {
  const { userId, title, message, actionUrl, skipEmail, skipPush } = opts

  // 1. In-app notification (always)
  const notification = await Notification.create({
    userId,
    title,
    message,
    channel: 'in_app',
    actionUrl,
  })

  // 1b. Real-time socket event for instant toast/badge
  try {
    const io = getIO()
    io.to(`user:${userId}`).emit('notification:new', {
      id: notification._id.toString(),
      title,
      message,
      actionUrl,
      createdAt: (notification as unknown as { createdAt?: Date }).createdAt,
    })
    // Signal the client to refetch badge counts
    io.to(`user:${userId}`).emit('badges:update')
  } catch (err) {
    console.warn('[Notify] Socket emit failed:', (err as Error).message)
  }

  // 2. Email (best-effort, non-blocking)
  if (!skipEmail) {
    User.findById(userId).select('email firstName').lean().then((user) => {
      if (user?.email) {
        // title/message/actionUrl can contain user-generated content (e.g. chat
        // messages) — escape before HTML interpolation. subject/text are
        // plain-text contexts and stay unescaped.
        const safeTitle = escapeHtml(title)
        const safeMessage = escapeHtml(message)
        const safeActionUrl = actionUrl ? escapeHtml(actionUrl) : undefined
        sendEmail({
          to: user.email,
          subject: title,
          text: message,
          html: `<h3>${safeTitle}</h3><p>${safeMessage}</p>${safeActionUrl ? `<p><a href="https://rentos.gh${safeActionUrl}" style="background:#1e3a5f;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block">View Details</a></p>` : ''}`,
        }).catch((err) => console.warn('[Notify] Email failed:', err.message))
      }
    }).catch((err) => console.warn('[Notify] User lookup failed:', err.message))
  }

  // 3. Push notification (best-effort, non-blocking)
  if (!skipPush) {
    sendPushNotification(userId, {
      title,
      body: message,
      data: actionUrl ? { url: actionUrl } : undefined,
    }).catch((err) => console.warn('[Notify] Push failed:', err.message))
  }
}

// ─── Pre-built notification helpers ───

export function notifyApplicationReceived(landlordId: string, tenantName: string, propertyTitle: string) {
  return notify({
    userId: landlordId,
    title: 'New Application',
    message: `${tenantName} submitted an application for "${propertyTitle}".`,
    actionUrl: '/applications',
  })
}

export function notifyApplicationApproved(tenantId: string, propertyTitle: string) {
  return notify({
    userId: tenantId,
    title: 'Application Approved',
    message: `Your application for "${propertyTitle}" has been approved! Check your agreements.`,
    actionUrl: '/agreements',
  })
}

export function notifyApplicationRejected(tenantId: string, propertyTitle: string, notes?: string) {
  return notify({
    userId: tenantId,
    title: 'Application Rejected',
    message: `Your application for "${propertyTitle}" was not approved.${notes ? ` Notes: ${notes}` : ''}`,
    actionUrl: '/applications',
  })
}

export function notifyPaymentReceived(landlordId: string, tenantName: string, amount: number, reference: string) {
  return notify({
    userId: landlordId,
    title: 'Payment Received',
    message: `${tenantName} paid GHS ${amount.toFixed(2)} (Ref: ${reference}).`,
    actionUrl: '/payments',
  })
}

export function notifyPaymentConfirmed(tenantId: string, amount: number, reference: string) {
  return notify({
    userId: tenantId,
    title: 'Payment Confirmed',
    message: `Your payment of GHS ${amount.toFixed(2)} has been confirmed (Ref: ${reference}).`,
    actionUrl: '/payments',
  })
}

export function notifyDisputeFiled(targetUserId: string, disputeTitle: string, filedByName: string) {
  return notify({
    userId: targetUserId,
    title: 'Dispute Filed',
    message: `${filedByName} filed a dispute: "${disputeTitle}".`,
    actionUrl: '/disputes',
  })
}

export function notifyDisputeUpdate(userId: string, disputeTitle: string, newStatus: string) {
  return notify({
    userId: userId,
    title: 'Dispute Updated',
    message: `"${disputeTitle}" has been updated to: ${newStatus.replace('_', ' ')}.`,
    actionUrl: '/disputes',
  })
}

export function notifyAgreementSigned(otherPartyId: string, propertyTitle: string, signerName: string) {
  return notify({
    userId: otherPartyId,
    title: 'Agreement Signed',
    message: `${signerName} signed the agreement for "${propertyTitle}".`,
    actionUrl: '/agreements',
  })
}

export function notifyAgreementFullySigned(userId: string, propertyTitle: string) {
  return notify({
    userId: userId,
    title: 'Agreement Active',
    message: `The agreement for "${propertyTitle}" is now fully signed and active!`,
    actionUrl: '/agreements',
  })
}

export function notifyPropertyApproved(landlordId: string, propertyTitle: string) {
  return notify({
    userId: landlordId,
    title: 'Property Approved',
    message: `"${propertyTitle}" has been approved and is now live.`,
    actionUrl: '/properties',
  })
}

export function notifyPropertyRejected(landlordId: string, propertyTitle: string, reason?: string) {
  return notify({
    userId: landlordId,
    title: 'Property Rejected',
    message: `"${propertyTitle}" was rejected.${reason ? ` Reason: ${reason}` : ''}`,
    actionUrl: '/properties',
  })
}

export function notifyNewMessage(recipientId: string, senderName: string, preview: string) {
  return notify({
    userId: recipientId,
    title: `Message from ${senderName}`,
    message: preview.length > 80 ? preview.slice(0, 80) + '...' : preview,
    actionUrl: '/messages',
    skipPush: false,
  })
}

export function notifyRentReminder(tenantId: string, amount: number, daysLeft: number, propertyTitle: string) {
  return notify({
    userId: tenantId,
    title: 'Rent Due Soon',
    message: `Your rent of GHS ${amount.toFixed(2)} for "${propertyTitle}" is due in ${daysLeft} days.`,
    actionUrl: '/payments',
  })
}

export function notifyWelcome(userId: string, firstName: string) {
  return notify({
    userId,
    title: 'Welcome to RentOS Ghana!',
    message: `Hi ${firstName}, your account is ready. Start exploring rental properties, create agreements, and save with RentGuard.`,
    actionUrl: '/dashboard',
  })
}

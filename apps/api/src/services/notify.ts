import { logger } from '../utils/logger.js'
/**
 * Unified notification service.
 * Writes the in-app notification, then email and push — each outbound channel
 * only where the recipient's notification preferences allow it.
 */

import { Notification } from '../models/Notification.js'
import { User } from '../models/User.js'
import { sendEmail, absoluteUrl } from './email.js'
import { sendPushNotification } from './push.js'
import { getIO } from './socket.js'

/**
 * What a notification is about, which decides which of the user's toggles
 * (Settings → Notifications: email, sms, push, payment, savings) apply.
 *
 * Optional — the user's toggles are honoured:
 *   'account'  (default) activity on the user's own account: applications,
 *              agreements, messages, maintenance, disputes, listings, etc.
 *              Channel toggles (email / sms / push) apply.
 *   'payment'  payment reminders (rent due soon / overdue reminders). The
 *              `payment` toggle AND the channel toggles apply; with `payment`
 *              off nothing is sent, including the in-app item.
 *   'savings'  savings alerts (goal progress and milestones). As 'payment',
 *              with the `savings` toggle.
 *
 * Exempt — strictly necessary, sent on every channel whatever the toggles:
 *   'security' account-security notices (credential or two-factor changes,
 *              suspicious activity, suspension). Password-reset emails are sent
 *              directly by authService and are exempt for the same reason.
 *   'receipt'  confirmation of money the user paid — the payment receipt
 *              record a tenant is entitled to for rent they paid.
 *
 * The in-app notification centre has no toggle: it is the account's own record
 * and is written for every category unless a category toggle suppresses it.
 * SMS: no notification is sent by SMS today (services/sms.ts has no callers);
 * `sms` is still resolved here so a future SMS sender honours the toggle.
 */
export type NotificationCategory = 'account' | 'payment' | 'savings' | 'security' | 'receipt' | 'promotion'

export const EXEMPT_CATEGORIES: readonly NotificationCategory[] = ['security', 'receipt']

export interface NotificationPreferences {
  email?: boolean
  sms?: boolean
  push?: boolean
  payment?: boolean
  savings?: boolean
}

export interface DeliveryPlan {
  inApp: boolean
  email: boolean
  push: boolean
  sms: boolean
}

/**
 * Decide which channels a notification may use.
 *
 * `prefs` is the stored settings.notifications object; a missing key means the
 * schema default (on). `null` means the preferences could not be read (user
 * missing or lookup failed): optional outbound delivery is then skipped rather
 * than guessed, while the in-app record is still written.
 */
export function deliveryPlan(category: NotificationCategory, prefs: NotificationPreferences | null): DeliveryPlan {
  if (EXEMPT_CATEGORIES.includes(category)) return { inApp: true, email: true, push: true, sms: true }
  // Promotional nudges never go out by email, push or SMS: there is no marketing
  // consent to rely on (Act 843 s.40), so they stay inside the recipient's account.
  if (category === 'promotion') return { inApp: true, email: false, push: false, sms: false }
  if (!prefs) return { inApp: true, email: false, push: false, sms: false }
  const categoryOn = category === 'payment' ? prefs.payment !== false
    : category === 'savings' ? prefs.savings !== false
      : true
  if (!categoryOn) return { inApp: false, email: false, push: false, sms: false }
  return { inApp: true, email: prefs.email !== false, push: prefs.push !== false, sms: prefs.sms !== false }
}

export const NOTIFICATION_SETTINGS_PATH = '/settings?tab=notifications'

interface NotifyOptions {
  userId: string
  title: string
  message: string
  actionUrl?: string
  /** Which preference toggles apply. Defaults to 'account'. */
  category?: NotificationCategory
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
 * Footer for notification emails. Optional categories carry a link to the
 * notification settings where the user can turn the email off; exempt ones say
 * why they arrive regardless.
 */
export function emailFooter(category: NotificationCategory): { text: string; html: string } {
  if (EXEMPT_CATEGORIES.includes(category)) {
    const note = 'This is a required service message about your RentOS account or a payment. It is sent even if optional notifications are turned off.'
    return { text: `\n\n--\n${note}`, html: `<hr><p style="color:#6b7280;font-size:12px">${note}</p>` }
  }
  const url = absoluteUrl(NOTIFICATION_SETTINGS_PATH)
  const safeUrl = escapeHtml(url)
  return {
    text: `\n\n--\nYou received this because email notifications are on for your RentOS account. Unsubscribe or manage notification preferences: ${url}`,
    html: `<hr><p style="color:#6b7280;font-size:12px">You received this because email notifications are on for your RentOS account. <a href="${safeUrl}">Unsubscribe or manage notification preferences</a>.</p>`,
  }
}

/**
 * Send notification across all channels:
 * 1. Always creates in_app notification
 * 2. Sends email if user email is available
 * 3. Sends push notification if device tokens are registered
 */
/**
 * Best-effort notification. Never rejects.
 *
 * This is called ~40 times across the routes WITHOUT await and without a
 * .catch — deliberately, because a notification is a side effect and the
 * request should not wait for it. But the first statement here was an
 * unguarded `await Notification.create(...)`, so a transient database error
 * rejected this promise with nothing attached to handle it.
 *
 * Node terminates the process on an unhandled rejection, and there is no
 * process-level handler. So a database blip while telling a landlord about a
 * maintenance request took down the entire API for every user. The email and
 * push sections below were already written as best-effort with .catch on
 * each; the in-app write was the one path that could still throw.
 *
 * Returns false only when the in-app notification could not be written; a
 * notification the user's preferences suppress is handled, not failed, and
 * returns true.
 */
export async function notify(opts: NotifyOptions): Promise<boolean> {
  try {
    await createNotification(opts)
    return true
  } catch (err) {
    logger.warn(`[Notify] failed for user ${opts.userId}: ${(err as Error).message}`)
    return false
  }
}

/** Recipient email + stored preferences; null when unavailable. Never throws. */
async function loadRecipient(userId: string): Promise<{ email?: string; prefs: NotificationPreferences } | null> {
  try {
    const user = await User.findById(userId).select('email settings.notifications').lean()
    if (!user) return null
    return { email: user.email, prefs: (user.settings?.notifications ?? {}) as NotificationPreferences }
  } catch (err) {
    logger.warn(`[Notify] preference lookup failed for user ${userId}: ${(err as Error).message}`)
    return null
  }
}

async function createNotification(opts: NotifyOptions) {
  const { userId, title, message, actionUrl, skipEmail, skipPush } = opts
  const category = opts.category ?? 'account'

  const recipient = await loadRecipient(userId)
  const plan = deliveryPlan(category, recipient?.prefs ?? null)
  if (!plan.inApp) return null

  // 1. In-app notification
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
  if (!skipEmail && plan.email && recipient?.email) {
    // title/message/actionUrl can contain user-generated content (e.g. chat
    // messages) — escape before HTML interpolation. subject/text are
    // plain-text contexts and stay unescaped.
    const safeTitle = escapeHtml(title)
    const safeMessage = escapeHtml(message)
    // Link targets must be absolute and environment-aware — this used to
    // hardcode https://rentos.gh, so every staging/dev notification pointed
    // at production.
    const safeActionUrl = actionUrl ? escapeHtml(absoluteUrl(actionUrl)) : undefined
    const footer = emailFooter(category)
    sendEmail({
      to: recipient.email,
      subject: title,
      text: `${message}${footer.text}`,
      html: `<h3>${safeTitle}</h3><p>${safeMessage}</p>${safeActionUrl ? `<p><a href="${safeActionUrl}" style="background:#1e3a5f;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block">View Details</a></p>` : ''}${footer.html}`,
    }).catch((err) => console.warn('[Notify] Email failed:', err.message))
  }

  // 3. Push notification (best-effort, non-blocking)
  if (!skipPush && plan.push) {
    sendPushNotification(userId, {
      title,
      body: message,
      data: actionUrl ? { url: actionUrl } : undefined,
    }).catch((err) => console.warn('[Notify] Push failed:', err.message))
  }

  return notification
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
    // The payer's receipt — exempt from the optional toggles.
    category: 'receipt',
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

/**
 * Owner-facing notification for a "request changes" decision. The issue list is
 * included in the message because the owner needs to know WHAT to fix without
 * opening the app.
 */
export function notifyPropertyChangesRequested(landlordId: string, propertyTitle: string, issues: string[]) {
  const list = issues.length ? ` Please fix: ${issues.join('; ')}.` : ''
  return notify({
    userId: landlordId,
    title: 'Changes requested on your listing',
    message: `"${propertyTitle}" needs updates before it can be approved.${list}`,
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
    category: 'payment',
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

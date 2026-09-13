import { OAuth2Client } from 'google-auth-library'
import { z } from 'zod'
import { envOptional } from '../../utils/env.js'
import { StorePurchase } from '../../models/StorePurchase.js'
import { StoreNotification } from '../../models/StoreNotification.js'
import { googlePurchaseTokenInput, purchaseTokenHash } from './googlePlay.js'
import { completeGooglePurchase } from './completePurchase.js'

export class GoogleNotificationError extends Error {
  constructor(public readonly status: number) { super('Google notification could not be processed') }
}
const auth = new OAuth2Client()
export async function authenticateGoogleNotification(header: string | undefined) {
  const audience = envOptional('GOOGLE_PLAY_PUBSUB_AUDIENCE')
  const email = envOptional('GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL')
  if (!audience || !email) throw new GoogleNotificationError(503)
  if (!header || !/^Bearer [^\s]{1,16384}$/.test(header)) throw new GoogleNotificationError(401)
  try {
    const ticket = await auth.verifyIdToken({ idToken: header.slice(7), audience })
    const payload = ticket.getPayload()
    if (payload?.email !== email || payload.email_verified !== true || !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) throw new Error('Identity mismatch')
  } catch { throw new GoogleNotificationError(401) }
}
const envelopeSchema = z.object({ subscription: z.string().min(1).max(512), message: z.object({ messageId: z.string().min(1).max(256), data: z.string().min(1).max(32768).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/) }) })
const notificationSchema = z.object({
  version: z.literal('1.0'), packageName: z.string().min(1), eventTimeMillis: z.string().regex(/^\d{1,16}$/),
  subscriptionNotification: z.object({ version: z.literal('1.0'), notificationType: z.number().int().positive(), purchaseToken: googlePurchaseTokenInput }).optional(),
  testNotification: z.object({ version: z.literal('1.0') }).optional(),
  oneTimeProductNotification: z.unknown().optional(), pendingRefundReviewNotification: z.unknown().optional(),
  voidedPurchaseNotification: z.object({ purchaseToken: googlePurchaseTokenInput, orderId: z.string().min(1).max(256), productType: z.number().int(), refundType: z.number().int() }).optional(),
}).refine(value => [value.subscriptionNotification, value.testNotification, value.oneTimeProductNotification, value.voidedPurchaseNotification, value.pendingRefundReviewNotification].filter(value => value !== undefined).length === 1)

/** Subscription state notifications prompt a fresh Publisher read. Authenticated
 * voided-order evidence is persisted independently before that refresh. A delivery is acknowledged only after durable work.
 */
export async function processGoogleNotification(body: unknown) {
  const subscription = envOptional('GOOGLE_PLAY_PUBSUB_SUBSCRIPTION')
  const applicationId = envOptional('GOOGLE_PLAY_PACKAGE_NAME')
  if (!subscription || !applicationId) throw new GoogleNotificationError(503)
  const parsed = envelopeSchema.safeParse(body)
  if (!parsed.success) throw new GoogleNotificationError(400)
  if (parsed.data.subscription !== subscription) throw new GoogleNotificationError(403)
  let decoded: unknown
  try { decoded = JSON.parse(Buffer.from(parsed.data.message.data, 'base64').toString('utf8')) } catch { throw new GoogleNotificationError(400) }
  const notification = notificationSchema.safeParse(decoded)
  if (!notification.success) throw new GoogleNotificationError(400)
  if (notification.data.packageName !== applicationId) throw new GoogleNotificationError(403)
  if (notification.data.testNotification) return
  // Unsupported financial notification types must not be silently acknowledged.
  const voided = notification.data.voidedPurchaseNotification
  if (!notification.data.subscriptionNotification && !(voided?.productType === 1 && voided.refundType === 1)) throw new GoogleNotificationError(503)
  const delivery = { subscription, messageId: parsed.data.message.messageId }
  if (await StoreNotification.exists(delivery)) return
  const token = notification.data.subscriptionNotification?.purchaseToken ?? voided!.purchaseToken
  const purchase = await StorePurchase.findOne({ platform: 'google', applicationId, tokenHash: purchaseTokenHash(token) }).select('userId').lean()
  // An event can precede device registration. Ask Pub/Sub to retry rather than
  // inventing an owner or accepting a purchase without its account binding.
  if (!purchase) throw new GoogleNotificationError(503)
  if (voided) {
    // Authenticated full-refund evidence survives fresh observations and applies
    // immediately to only the matching order, even if the provider read fails.
    const saved = await StorePurchase.updateOne({ platform: 'google', applicationId, tokenHash: purchaseTokenHash(token), userId: purchase.userId }, { $addToSet: { voidedOrderIds: voided.orderId }, $set: { recoveryNextAttemptAt: new Date(0) } })
    if (!saved.matchedCount) throw new GoogleNotificationError(503)
  }
  await completeGooglePurchase(purchase.userId, token)
  try { await StoreNotification.create(delivery) } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error
  }
}

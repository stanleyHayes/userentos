import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import webpush from 'web-push'
import { DeviceToken, type DevicePlatform } from '../models/DeviceToken.js'
import { pushTokenSchema, pushPlatformSchema, webPushSubscriptionSchema } from './push/input.js'
import { logger } from '../utils/logger.js'

/**
 * Browser notifications (Web Push, RFC 8030) for the web app, so a new message
 * reaches someone whose RentOS tab is in the background or closed. Needs a
 * VAPID key pair: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (a
 * mailto: or https: contact). Without them the web app simply does not offer
 * browser notifications.
 */
let webPushReady: boolean | null = null
export function webPushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? process.env.VAPID_PUBLIC_KEY : null
}
function webPushConfigured(): boolean {
  if (webPushReady !== null) return webPushReady
  const publicKey = webPushPublicKey()
  if (!publicKey) return (webPushReady = false)
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@userentos.com', publicKey, process.env.VAPID_PRIVATE_KEY!)
    webPushReady = true
  } catch (err) {
    logger.warn(`[Push/Web] VAPID keys rejected: ${(err as Error).message}`)
    webPushReady = false
  }
  return webPushReady
}

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    initializeApp({ credential: cert(serviceAccount) })
    logger.info('[Push] Firebase Admin initialized')
  } catch (err) {
    logger.warn(`[Push] Firebase initialization failed: ${(err as Error).message}`)
  }
} else {
  logger.warn('[Push] FIREBASE_SERVICE_ACCOUNT not set — FCM disabled (Expo push still available)')
}

interface PushPayload {
  title: string
  body: string
  data?: Record<string, string>
}

function detectPlatform(token: string): DevicePlatform {
  if (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[')) return 'expo'
  if (token.startsWith('{')) return 'webpush'
  return 'fcm'
}

export async function registerDeviceToken(
  userId: string,
  token: string,
  platform?: DevicePlatform,
): Promise<void> {
  pushTokenSchema.parse(token)
  const resolvedPlatform = platform === undefined ? detectPlatform(token) : pushPlatformSchema.parse(platform)
  if (resolvedPlatform === 'webpush') webPushSubscriptionSchema.parse(JSON.parse(token))
  await DeviceToken.findOneAndUpdate(
    { token },
    { userId, token, platform: resolvedPlatform, lastSeenAt: new Date() },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  )
}

export async function unregisterDeviceToken(userId: string, token: string): Promise<void> {
  pushTokenSchema.parse(token)
  // Scope deletion to the owner — an attacker must not be able to unregister
  // another user's device by guessing/knowing their push token.
  await DeviceToken.deleteOne({ token, userId })
}

interface ExpoPushTicket {
  status: 'ok' | 'error'
  id?: string
  message?: string
  details?: { error?: string }
}

async function sendViaExpo(tokens: string[], payload: PushPayload): Promise<string[]> {
  if (tokens.length === 0) return []
  const messages = tokens.map((to) => ({
    to,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    sound: 'default' as const,
  }))

  const deadTokens: string[] = []
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    })
    const json = (await res.json()) as { data?: ExpoPushTicket[] }
    json.data?.forEach((ticket, i) => {
      if (ticket.status === 'error') {
        const code = ticket.details?.error
        if (code === 'DeviceNotRegistered' || code === 'InvalidCredentials') {
          deadTokens.push(tokens[i])
        }
      }
    })
  } catch (err) {
    logger.warn(`[Push/Expo] send failed: ${(err as Error).message}`)
  }
  return deadTokens
}

async function sendViaFcm(tokens: string[], payload: PushPayload): Promise<string[]> {
  if (tokens.length === 0 || getApps().length === 0) return []
  const deadTokens: string[] = []
  try {
    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
    })
    response.responses.forEach((resp, i) => {
      if (!resp.success) {
        const code = resp.error?.code
        if (
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/registration-token-not-registered'
        ) {
          deadTokens.push(tokens[i])
        }
      }
    })
  } catch (err) {
    logger.warn(`[Push/FCM] send failed: ${(err as Error).message}`)
  }
  return deadTokens
}

async function sendViaWebPush(tokens: string[], payload: PushPayload): Promise<string[]> {
  if (tokens.length === 0 || !webPushConfigured()) return []
  const body = JSON.stringify({ title: payload.title, body: payload.body, url: payload.data?.url ?? '/', tag: payload.data?.tag })
  const dead: string[] = []
  await Promise.all(tokens.map(async (token) => {
    try {
      await webpush.sendNotification(JSON.parse(token), body, { TTL: 24 * 60 * 60, urgency: 'high' })
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      // 404/410: the browser dropped the subscription.
      if (status === 404 || status === 410) dead.push(token)
      else logger.warn(`[Push/Web] send failed: ${status ?? ''} ${(err as Error).message}`)
    }
  }))
  return dead
}

export async function sendPushNotification(userId: string, payload: PushPayload): Promise<boolean> {
  const records = await DeviceToken.find({ userId }).lean()
  if (records.length === 0) return false

  const expoTokens = records.filter((r) => r.platform === 'expo').map((r) => r.token)
  const fcmTokens = records.filter((r) => r.platform === 'fcm').map((r) => r.token)
  const webTokens = records.filter((r) => r.platform === 'webpush').map((r) => r.token)

  const [deadExpo, deadFcm, deadWeb] = await Promise.all([
    sendViaExpo(expoTokens, payload),
    sendViaFcm(fcmTokens, payload),
    sendViaWebPush(webTokens, payload),
  ])

  const dead = [...deadExpo, ...deadFcm, ...deadWeb]
  if (dead.length > 0) {
    await DeviceToken.deleteMany({ token: { $in: dead } })
  }

  const sent = expoTokens.length - deadExpo.length + (fcmTokens.length - deadFcm.length) + (webTokens.length - deadWeb.length)
  return sent > 0
}

export function pushPaymentConfirmation(userId: string, amount: number) {
  return sendPushNotification(userId, {
    title: 'Payment Confirmed',
    body: `Your rent payment of GHS ${amount.toFixed(2)} has been confirmed.`,
    data: { type: 'payment', url: '/payments' },
  })
}

export function pushRentReminder(userId: string, amount: number, daysLeft: number) {
  return sendPushNotification(userId, {
    title: 'Rent Due Soon',
    body: `Your rent of GHS ${amount.toFixed(2)} is due in ${daysLeft} days.`,
    data: { type: 'reminder', url: '/payments' },
  })
}

export function pushDisputeUpdate(userId: string, title: string, status: string) {
  return sendPushNotification(userId, {
    title: 'Dispute Update',
    body: `"${title}" is now ${status.replace('_', ' ')}.`,
    data: { type: 'dispute', url: '/disputes' },
  })
}

export function pushSavingsGoal(userId: string, percent: number) {
  return sendPushNotification(userId, {
    title: 'Savings Milestone',
    body: `You're ${percent}% towards your rent savings goal!`,
    data: { type: 'savings', url: '/savings' },
  })
}

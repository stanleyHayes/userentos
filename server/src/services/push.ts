import admin from 'firebase-admin'
import { DeviceToken, type DevicePlatform } from '../models/DeviceToken.js'
import { logger } from '../utils/logger.js'

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
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
  return 'fcm'
}

export async function registerDeviceToken(
  userId: string,
  token: string,
  platform?: DevicePlatform,
): Promise<void> {
  const resolvedPlatform = platform ?? detectPlatform(token)
  await DeviceToken.findOneAndUpdate(
    { token },
    { userId, token, platform: resolvedPlatform, lastSeenAt: new Date() },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  )
}

export async function unregisterDeviceToken(_userId: string, token: string): Promise<void> {
  await DeviceToken.deleteOne({ token })
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
  if (tokens.length === 0 || !admin.apps?.length) return []
  const deadTokens: string[] = []
  try {
    const response = await admin.messaging().sendEachForMulticast({
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

export async function sendPushNotification(userId: string, payload: PushPayload): Promise<boolean> {
  const records = await DeviceToken.find({ userId }).lean()
  if (records.length === 0) return false

  const expoTokens = records.filter((r) => r.platform === 'expo').map((r) => r.token)
  const fcmTokens = records.filter((r) => r.platform === 'fcm').map((r) => r.token)

  const [deadExpo, deadFcm] = await Promise.all([
    sendViaExpo(expoTokens, payload),
    sendViaFcm(fcmTokens, payload),
  ])

  const dead = [...deadExpo, ...deadFcm]
  if (dead.length > 0) {
    await DeviceToken.deleteMany({ token: { $in: dead } })
  }

  const sent = expoTokens.length - deadExpo.length + (fcmTokens.length - deadFcm.length)
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

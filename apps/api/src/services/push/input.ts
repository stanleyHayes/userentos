import { z } from 'zod'

// Device tokens are opaque printable strings, never MongoDB filter documents.
export const pushTokenSchema = z.string().min(1).max(4096).regex(/^[\x21-\x7e]+$/, 'Invalid device token')
export const pushPlatformSchema = z.enum(['expo', 'fcm', 'apns', 'webpush'])

/** A browser's PushSubscription.toJSON(), as the web app sends it. */
export const webPushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048).refine((url) => url.startsWith('https://'), 'Push endpoints are HTTPS'),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(64) }),
})
export const registerPushSchema = z.object({ token: pushTokenSchema, platform: pushPlatformSchema.optional() }).strict()
export const unregisterPushSchema = z.object({ token: pushTokenSchema }).strict()

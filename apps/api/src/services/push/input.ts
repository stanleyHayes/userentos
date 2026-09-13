import { z } from 'zod'

// Device tokens are opaque printable strings, never MongoDB filter documents.
export const pushTokenSchema = z.string().min(1).max(4096).regex(/^[\x21-\x7e]+$/, 'Invalid device token')
export const pushPlatformSchema = z.enum(['expo', 'fcm', 'apns'])
export const registerPushSchema = z.object({ token: pushTokenSchema, platform: pushPlatformSchema.optional() }).strict()
export const unregisterPushSchema = z.object({ token: pushTokenSchema }).strict()

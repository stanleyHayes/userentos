export const notificationPreferenceKeys = ['email', 'sms', 'push', 'payment', 'savings'] as const
export type NotificationPreferenceKey = (typeof notificationPreferenceKeys)[number]
export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>

/** Returns the saved preferences only when every channel is an explicit boolean.
 * A partial or malformed response must not be shown as the user's real choices. */
export function parseNotificationPreferences(settings: unknown): NotificationPreferences | null {
  if (!settings || typeof settings !== 'object') return null
  const notifications = (settings as { notifications?: unknown }).notifications
  if (!notifications || typeof notifications !== 'object') return null
  const values = notifications as Record<string, unknown>
  if (!notificationPreferenceKeys.every(key => typeof values[key] === 'boolean')) return null
  return Object.fromEntries(notificationPreferenceKeys.map(key => [key, values[key]])) as NotificationPreferences
}

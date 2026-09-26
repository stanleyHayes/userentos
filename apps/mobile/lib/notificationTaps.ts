import { safeAppRoute } from './safeRoute'

/** The part of an expo-notifications response a tap needs. */
export interface NotificationTap {
  notification: { request: { identifier: string; content: { data?: Record<string, unknown> | null } } }
}

/**
 * Opens the screen behind each notification tap exactly once.
 *
 * A tap that launches a closed app can be emitted before any JS listener
 * exists (the emitter drops it; likely on Android), so the launch tap is also
 * read back from getLastNotificationResponse() once the stored session is
 * restored. The same tap can then arrive both ways; identifiers dedupe it, and
 * the stored response is cleared so a later launch does not replay it. A tap
 * that arrives while signed out, or before the session is restored, waits and
 * opens after sign-in.
 */
export function createNotificationTaps(dependencies: {
  navigate: (route: string) => void
  readLast: () => NotificationTap | null
  clearLast: () => void
}) {
  const handled = new Set<string>()
  let waiting: string | null = null
  let launchRead = false

  function receive(tap: NotificationTap | null | undefined, canOpen: boolean) {
    const id = tap?.notification?.request?.identifier
    if (!tap || !id || handled.has(id)) return
    handled.add(id)
    try { dependencies.clearLast() } catch { /* unavailable on this platform */ }
    const route = safeAppRoute(tap.notification.request.content?.data?.url)
    if (!route) return
    if (canOpen) { waiting = null; dependencies.navigate(route) } else waiting = route
  }

  return {
    /** A tap delivered by the listener. `canOpen`: signed in and past the auth screens. */
    receive,
    /** Once the stored session is restored: pick up the tap that launched the app. */
    readLaunchTap() {
      if (launchRead) return
      launchRead = true
      let tap: NotificationTap | null = null
      try { tap = dependencies.readLast() } catch { /* unavailable on this platform */ }
      receive(tap, false)
    },
    /** Signed in and past the auth screens: open the tap that was waiting, if any. */
    openWaiting() {
      const route = waiting
      waiting = null
      if (route) dependencies.navigate(route)
    },
  }
}

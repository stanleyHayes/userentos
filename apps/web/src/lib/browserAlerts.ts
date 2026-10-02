/**
 * Browser alerts: a system notification when a message or alert arrives while
 * RentOS is in the background, and Web Push when it is closed (public/sw.js).
 *
 * Permission is only asked for when the person turns alerts on (Messages
 * banner, Settings → Notifications), never on page load: a prompt nobody
 * asked for is usually blocked for good.
 */
import { useSyncExternalStore } from 'react'
import { api } from './api'

type Permission = NotificationPermission | 'unsupported'

let pushActive = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

export function browserAlertsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && window.isSecureContext
}

function permission(): Permission {
  return browserAlertsSupported() ? Notification.permission : 'unsupported'
}

/** The permission and whether Web Push is set up, for components. */
export function useBrowserAlerts(): { permission: Permission; pushActive: boolean } {
  const snapshot = useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    () => `${permission()}|${pushActive}`,
    () => 'unsupported|false',
  )
  const [p, active] = snapshot.split('|')
  return { permission: p as Permission, pushActive: active === 'true' }
}

export function registerServiceWorker(): void {
  if (!browserAlertsSupported()) return
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* alerts stay in-tab */ })
}

function base64UrlToBytes(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const raw = window.atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}

/** With permission granted, make sure this browser is subscribed to Web Push. Never prompts. */
export async function syncBrowserAlerts(): Promise<void> {
  if (permission() !== 'granted' || !('PushManager' in window)) return
  try {
    const { publicKey } = await api.get<{ publicKey: string | null }>('/push/web-key')
    if (!publicKey) return
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
      ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) as BufferSource })
    await api.post('/push/register', { token: JSON.stringify(subscription.toJSON()), platform: 'webpush' })
    pushActive = true
    emit()
  } catch {
    // Push unavailable (private window, blocked by the browser): in-tab alerts still work.
  }
}

/** Turn alerts on: asks for permission (call from a click), then subscribes. */
export async function enableBrowserAlerts(): Promise<Permission> {
  if (!browserAlertsSupported()) return 'unsupported'
  const result = await Notification.requestPermission()
  emit()
  if (result === 'granted') await syncBrowserAlerts()
  return result
}

/** Signing out: this browser stops receiving the account's push alerts. */
export async function unsubscribeBrowserAlerts(): Promise<void> {
  if (!browserAlertsSupported()) return
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (subscription) {
      await api.post('/push/unregister', { token: JSON.stringify(subscription.toJSON()) }).catch(() => undefined)
      await subscription.unsubscribe()
    }
  } catch { /* nothing to undo */ }
  pushActive = false
  emit()
}

/**
 * An alert that arrived over the live connection while the tab is hidden.
 * When Web Push is active the service worker shows it instead, so it never
 * appears twice.
 */
export async function showBackgroundAlert(alert: { title: string; message: string; actionUrl?: string }): Promise<void> {
  if (pushActive || permission() !== 'granted' || document.visibilityState === 'visible') return
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const options = { body: alert.message, icon: '/email/rentos-mark.png', badge: '/email/rentos-mark.png', tag: alert.actionUrl, data: { url: alert.actionUrl ?? '/' } }
    if (registration) await registration.showNotification(alert.title, options)
    else new Notification(alert.title, options)
  } catch { /* the toast already showed it */ }
}

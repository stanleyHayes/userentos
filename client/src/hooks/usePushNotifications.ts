import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'

let registered = false

/** Reset on logout so the NEXT user on the same tab registers their own push. */
useAuthStore.subscribe((state, prev) => {
  if (prev.isAuthenticated && !state.isAuthenticated) registered = false
})

export function usePushNotifications() {
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    if (!token || registered) return
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return

    // Web push needs the server's VAPID public key; without it
    // pushManager.subscribe() always throws. Skip silently until configured.
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
    if (!vapidKey) return

    function urlBase64ToUint8Array(base64String: string): Uint8Array {
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
      const rawData = window.atob(base64)
      return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
    }

    async function registerPush() {
      try {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return

        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey!) as BufferSource,
        })

        const subscriptionJSON = subscription.toJSON()
        if (subscriptionJSON.endpoint) {
          await api.post('/push/register', {
            token: subscriptionJSON.endpoint,
            platform: 'web',
          })
          registered = true
        }
      } catch {
        // Push not supported or permission denied — fail silently
      }
    }

    registerPush()
  }, [token])
}

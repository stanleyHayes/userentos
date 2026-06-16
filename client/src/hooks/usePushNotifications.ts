import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'

let registered = false

export function usePushNotifications() {
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    if (!token || registered) return
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return

    async function registerPush() {
      try {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return

        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: undefined, // VAPID key would go here in production
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

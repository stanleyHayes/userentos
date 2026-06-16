import { useEffect, useRef } from 'react'
import * as Notifications from 'expo-notifications'
import { useRouter } from 'expo-router'
import { useAuthStore } from '../stores/authStore'
import { registerForPushNotifications, unregisterPushToken } from '../lib/push'

export function usePushNotifications() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const userId = useAuthStore((s) => s.user?.id)
  const router = useRouter()
  const tokenRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated || !userId) return
    let cancelled = false
    registerForPushNotifications().then((token) => {
      if (!cancelled) tokenRef.current = token
    })
    return () => {
      cancelled = true
      const t = tokenRef.current
      if (t) {
        unregisterPushToken(t)
        tokenRef.current = null
      }
    }
  }, [isAuthenticated, userId])

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url
      if (typeof url === 'string' && url.length > 0) {
        router.push(url as never)
      }
    })
    return () => sub.remove()
  }, [router])
}

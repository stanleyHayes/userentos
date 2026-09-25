import { useEffect, useRef, useState } from 'react'
import * as Notifications from 'expo-notifications'
import { useRouter } from 'expo-router'
import { useAuthStore } from '../stores/authStore'
import { registerForPushNotifications, unregisterPushToken } from '../lib/push'
import { safeAppRoute } from '../lib/safeRoute'
import { createSessionCallbackGuard } from '../lib/sessionCallbacks'
import { onPushOptIn } from '../lib/pushSession'

export function usePushNotifications() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const userId = useAuthStore((s) => s.user?.id)
  const sessionVersion = useAuthStore((s) => s.sessionVersion)
  const router = useRouter()
  const tokenRef = useRef<string | null>(null)
  // Bumped when the user grants permission from the in-context pre-prompt, so
  // this session registers its token then (sign-in itself never prompts).
  const [optInCount, setOptInCount] = useState(0)

  useEffect(() => onPushOptIn(() => setOptInCount((n) => n + 1)), [])

  useEffect(() => {
    if (!isAuthenticated || !userId) return
    let cancelled = false
    registerForPushNotifications(() => !cancelled && useAuthStore.getState().sessionVersion === sessionVersion).then((token) => {
      if (!cancelled) tokenRef.current = token
    })
    return () => {
      cancelled = true
      const t = tokenRef.current
      if (t) {
        void unregisterPushToken(t, sessionVersion)
        tokenRef.current = null
      }
    }
  }, [isAuthenticated, userId, sessionVersion, optInCount])

  useEffect(() => {
    if (!isAuthenticated || !userId) return
    const guard = createSessionCallbackGuard(() => useAuthStore.getState().sessionVersion)
    const sub = Notifications.addNotificationResponseReceivedListener(guard.wrap((response) => {
      const url = response.notification.request.content.data?.url
      const route = safeAppRoute(url)
      if (route) {
        router.push(route as never)
      }
    }))
    return () => { guard.dispose(); sub.remove() }
  }, [router, isAuthenticated, userId, sessionVersion])
}

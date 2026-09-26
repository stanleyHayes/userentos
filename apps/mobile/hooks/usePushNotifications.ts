import { useEffect, useRef, useState } from 'react'
import * as Notifications from 'expo-notifications'
import { useRouter, useSegments } from 'expo-router'
import { useAuthStore } from '../stores/authStore'
import { registerForPushNotifications } from '../lib/push'
import { createNotificationTaps } from '../lib/notificationTaps'
import { onPushOptIn } from '../lib/pushSession'

export function usePushNotifications() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const hydrated = useAuthStore((s) => s.hydrated)
  const userId = useAuthStore((s) => s.user?.id)
  const sessionVersion = useAuthStore((s) => s.sessionVersion)
  const profilePending = useAuthStore((s) => s.profilePending)
  const router = useRouter()
  const segments = useSegments()
  // Bumped when the user grants permission from the in-context pre-prompt, so
  // this session registers its token then (sign-in itself never prompts).
  const [optInCount, setOptInCount] = useState(0)

  // Signed in and past the auth screens: the auth guard's redirect away from
  // the login screen would otherwise replace the screen a tap opened. On a
  // cold start that opened before the profile loaded, the tap also waits for
  // it, so the screen mounts knowing the account's role.
  const canOpen = hydrated && isAuthenticated && !profilePending && segments[0] !== 'auth'
  const canOpenRef = useRef(canOpen)
  canOpenRef.current = canOpen
  const routerRef = useRef(router)
  routerRef.current = router
  const taps = useRef<ReturnType<typeof createNotificationTaps> | null>(null)
  if (!taps.current) {
    taps.current = createNotificationTaps({
      navigate: (route) => routerRef.current.push(route as never),
      readLast: () => Notifications.getLastNotificationResponse(),
      clearLast: () => Notifications.clearLastNotificationResponse(),
    })
  }

  useEffect(() => onPushOptIn(() => setOptInCount((n) => n + 1)), [])

  // The registered token is remembered for the sign-out request, which
  // removes it on the server (lib/signOut.ts). An effect cleanup cannot do
  // that: by then the session and its access token are already gone.
  useEffect(() => {
    if (!isAuthenticated || !userId) return
    let cancelled = false
    void registerForPushNotifications(() => !cancelled && useAuthStore.getState().sessionVersion === sessionVersion)
    return () => { cancelled = true }
  }, [isAuthenticated, userId, sessionVersion, optInCount])

  // Listen from the first render, signed in or not: a tap is never dropped,
  // only held until it can be opened.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => taps.current!.receive(response, canOpenRef.current))
    return () => sub.remove()
  }, [])

  useEffect(() => {
    if (hydrated) taps.current!.readLaunchTap()
  }, [hydrated])

  useEffect(() => {
    if (canOpen) taps.current!.openWaiting()
  }, [canOpen, sessionVersion])
}

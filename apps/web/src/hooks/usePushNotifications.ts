import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { syncBrowserAlerts, unsubscribeBrowserAlerts } from '@/lib/browserAlerts'

let synced: string | null = null

/** Sign out: this browser stops receiving the account's push alerts. */
useAuthStore.subscribe((state, prev) => {
  if (prev.isAuthenticated && !state.isAuthenticated) {
    synced = null
    void unsubscribeBrowserAlerts()
  }
})

/**
 * Keeps this browser's push subscription registered for the signed-in
 * account (only once the person has allowed notifications; this never asks),
 * and opens the page a clicked notification points to.
 */
export function usePushNotifications() {
  const userId = useAuthStore((s) => s.user?.id)
  const navigate = useNavigate()

  useEffect(() => {
    if (!userId || synced === userId) return
    synced = userId
    void syncBrowserAlerts()
  }, [userId])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | undefined
      if (data?.type === 'rentos:navigate' && typeof data.url === 'string' && data.url.startsWith('/')) navigate(data.url)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])
}

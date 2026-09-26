import { useEffect } from 'react'
import { AppState, Vibration, type AppStateStatus } from 'react-native'
import { useAuthStore } from '../stores/authStore'
import { useNotificationStore } from '../stores/notificationStore'
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket'
import { api } from '../lib/api'
import { createSocketRecovery } from '../../../packages/shared/socketRecovery'
import { createSessionCallbackGuard } from '../lib/sessionCallbacks'

/**
 * Connects to Socket.IO at the app root level and feeds in-app notifications.
 * Should be called once in the root layout (after auth).
 */
export function useAppSocket() {
  const { token, isAuthenticated, sessionVersion } = useAuthStore()
  const { setUnreadMessages, incrementUnread, pushToast } = useNotificationStore()

  // Fetch initial unread count from API
  useEffect(() => {
    if (!isAuthenticated || !token) return
    const guard = createSessionCallbackGuard(() => useAuthStore.getState().sessionVersion)
    const owner = useAuthStore.getState().user?.id
    api.get<import('../stores/authStore').User>('/users/me').then(guard.wrap(user => { if (user.id === owner) useAuthStore.getState().updateUser(user) })).catch(() => {})
    api.get<{ count: number }>('/chat/unread-count')
      .then(guard.wrap(data => setUnreadMessages(data.count)))
      .catch(() => {})
    return () => guard.dispose()
  }, [isAuthenticated, token, sessionVersion])

  // Connect socket and listen for events
  useEffect(() => {
    if (!token || !isAuthenticated) return

    const guard = createSessionCallbackGuard(() => useAuthStore.getState().sessionVersion)
    const owner = useAuthStore.getState().user?.id
    const socket = connectSocket(token)
    const recovery = createSocketRecovery(
      () => useAuthStore.getState().isAuthenticated && useAuthStore.getState().sessionVersion === sessionVersion,
      () => api.get('/users/me'),
      () => {
        // Token updates rerun this effect and install listeners on the new socket.
        const current = useAuthStore.getState()
        if (getSocket() === socket && current.token && current.token !== token) connectSocket(current.token)
      },
    )
    const handleExpiry = () => { void recovery.run() }
    socket.on('session:expired', handleExpiry)
    const suspended = guard.wrap((data: { suspendedAt: string }) => useAuthStore.getState().updateUser(data))
    socket.on('account:suspended', suspended)
    // The server revoked the session this socket authenticated with (signed
    // out from another device, password reset, account closed). A newer token
    // already stored here, like the pair a password change returns, stays.
    const revoked = guard.wrap(() => {
      if (useAuthStore.getState().token === token) useAuthStore.getState().logout()
    })
    socket.on('session:revoked', revoked)

    const handleUnreadUpdate = guard.wrap((data: {
      conversationId: string
      unreadCount: number
      lastMessage: { text: string; senderId: string; createdAt: string }
    }) => {
      incrementUnread()
      Vibration.vibrate([0, 100, 50, 100])

      // Show in-app toast for new messages
      pushToast({
        title: 'New Message',
        body: data.lastMessage.text.length > 80
          ? data.lastMessage.text.slice(0, 80) + '...'
          : data.lastMessage.text,
        type: 'message',
        route: `/chat/${data.conversationId}`,
      })
    })

    const handleNotification = guard.wrap((data: {
      title?: string
      message?: string
      type?: string
      actionUrl?: string
    }) => {
      Vibration.vibrate(200)
      const type = (data.type ?? 'system') as 'message' | 'payment' | 'dispute' | 'agreement' | 'system'
      pushToast({
        title: data.title ?? 'Notification',
        body: data.message ?? '',
        type,
        route: data.actionUrl,
      })
    })

    socket.on('unread:update', handleUnreadUpdate)
    socket.on('notification:new', handleNotification)

    // Refetch unread count when app comes back to foreground
    const handleAppState = guard.wrap((state: AppStateStatus) => {
      if (state === 'active') {
        api.get<import('../stores/authStore').User>('/users/me').then(guard.wrap(user => { if (user.id === owner) useAuthStore.getState().updateUser(user) })).catch(() => {})
        api.get<{ count: number }>('/chat/unread-count')
          .then(guard.wrap(data => setUnreadMessages(data.count)))
          .catch(() => {})
      }
    })
    const subscription = AppState.addEventListener('change', handleAppState)

    return () => {
      guard.dispose()
      recovery.dispose()
      socket.off('session:expired', handleExpiry)
      socket.off('unread:update', handleUnreadUpdate)
      socket.off('account:suspended', suspended)
      socket.off('session:revoked', revoked)
      socket.off('notification:new', handleNotification)
      subscription.remove()
    }
  }, [token, isAuthenticated, sessionVersion])

  // Disconnect on logout
  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket()
      setUnreadMessages(0)
    }
  }, [isAuthenticated])
}

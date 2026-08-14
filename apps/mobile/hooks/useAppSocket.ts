import { useEffect } from 'react'
import { AppState, Vibration, type AppStateStatus } from 'react-native'
import { useAuthStore } from '../stores/authStore'
import { useNotificationStore } from '../stores/notificationStore'
import { connectSocket, disconnectSocket } from '../lib/socket'
import { api } from '../lib/api'

/**
 * Connects to Socket.IO at the app root level and feeds in-app notifications.
 * Should be called once in the root layout (after auth).
 */
export function useAppSocket() {
  const { token, isAuthenticated } = useAuthStore()
  const { setUnreadMessages, incrementUnread, pushToast } = useNotificationStore()

  // Fetch initial unread count from API
  useEffect(() => {
    if (!isAuthenticated || !token) return
    api.get<{ count: number }>('/chat/unread-count')
      .then((data) => setUnreadMessages(data.count))
      .catch(() => {})
  }, [isAuthenticated, token])

  // Connect socket and listen for events
  useEffect(() => {
    if (!token || !isAuthenticated) return

    const socket = connectSocket(token)

    const handleUnreadUpdate = (data: {
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
    }

    const handleNotification = (data: {
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
    }

    socket.on('unread:update', handleUnreadUpdate)
    socket.on('notification:new', handleNotification)

    // Refetch unread count when app comes back to foreground
    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        api.get<{ count: number }>('/chat/unread-count')
          .then((data) => setUnreadMessages(data.count))
          .catch(() => {})
      }
    }
    const subscription = AppState.addEventListener('change', handleAppState)

    return () => {
      socket.off('unread:update', handleUnreadUpdate)
      socket.off('notification:new', handleNotification)
      subscription.remove()
    }
  }, [token, isAuthenticated])

  // Disconnect on logout
  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket()
      setUnreadMessages(0)
    }
  }, [isAuthenticated])
}

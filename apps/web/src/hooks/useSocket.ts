import { useEffect, useSyncExternalStore } from 'react'
import { io, Socket } from 'socket.io-client'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { createSocketRecovery } from '../../../../packages/shared/socketRecovery'
import { getSessionGeneration, useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'

let socket: Socket | null = null
let connectionCount = 0

// The socket is a module-level singleton; subscribers re-render when it changes.
const socketListeners = new Set<() => void>()

function subscribeSocket(listener: () => void): () => void {
  socketListeners.add(listener)
  return () => socketListeners.delete(listener)
}

function getSocketSnapshot(): Socket | null {
  return socket
}

function emitSocketChange(): void {
  socketListeners.forEach((listener) => listener())
}

function getServerUrl(): string {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL
  // Follow the HTTP API's origin. Relative APIs use the same-origin socket
  // proxy in development, including isolated test servers on alternate ports.
  return new URL(import.meta.env.VITE_API_URL || '/api', window.location.origin).origin
}

function connectSocket(token: string): Socket {
  // Reuse the live instance: a socket that is mid-connect or temporarily
  // disconnected (auto-reconnect in progress) must not be replaced by a
  // second, orphaned connection. Only an explicitly destroyed socket is recreated.
  if (socket) {
    // Shared consumers may keep the singleton alive while HTTP refresh rotates
    // its token. Future reconnects must authenticate with the current session.
    const previousToken = (socket.auth as { token?: string }).token
    if (previousToken !== token) {
      socket.disconnect()
      socket.auth = { token }
      socket.connect()
    }
    return socket
  }

  socket = io(getServerUrl(), {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  })

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id)
  })
  socket.on('account:suspended', (data: { suspendedAt: string }) => {
    const user = useAuthStore.getState().user
    if (user) useAuthStore.setState({ user: { ...user, suspendedAt: data.suspendedAt } })
  })
  // The server revoked the session this socket authenticated with (signed
  // out from another device, password reset, account closed). A tab already
  // holding a newer token, like the pair a password change returns, stays.
  const created = socket
  socket.on('session:revoked', () => {
    const { isAuthenticated, token: current, logout } = useAuthStore.getState()
    if (!isAuthenticated || current !== (created.auth as { token?: string }).token) return
    logout()
    useToastStore.getState().addToast('You have been signed out. Please sign in again.', 'info')
  })

  socket.on('connect_error', (err) => {
    console.warn('[Socket] Connection error:', err.message)
  })

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason)
    // Server-initiated disconnection is terminal (for example account closure).
    // Transport failures still use Socket.IO's normal automatic reconnection.
  })

  emitSocketChange()
  return socket
}

function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
  connectionCount = 0
  emitSocketChange()
}

/**
 * Singleton socket hook. Connects when authenticated, disconnects on logout.
 * Returns the socket instance (or null if not connected).
 */
export function useSocket(): Socket | null {
  const token = useAuthStore((s) => s.token)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const socketInstance = useSyncExternalStore(subscribeSocket, getSocketSnapshot)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (isAuthenticated && token) {
      connectionCount++
      const s = connectSocket(token)
      const generation = getSessionGeneration()
      const recovery = createSocketRecovery(
        () => getSessionGeneration() === generation && useAuthStore.getState().isAuthenticated,
        () => api.get('/users/me'),
        () => {
          const currentToken = useAuthStore.getState().token
          if (socket === s && currentToken && currentToken !== token) connectSocket(currentToken)
        },
      )
      const handleExpiry = () => { void recovery.run() }
      s.on('session:expired', handleExpiry)

      // Listen for real-time notifications → show toast
      const handleNotification = (data: { title: string; message: string }) => {
        useToastStore.getState().addToast(`${data.title}: ${data.message}`, 'info')
      }
      s.on('notification:new', handleNotification)

      // Listen for badge count updates → refetch badge counts & notifications
      const handleBadgeUpdate = () => {
        queryClient.invalidateQueries({ queryKey: ['badge-counts'] })
        queryClient.invalidateQueries({ queryKey: ['notifications'] })
      }
      s.on('badges:update', handleBadgeUpdate)

      // Listen for booking events → refetch bookings
      const handleBookingEvent = (data: { bookingId: string; message: string }) => {
        queryClient.invalidateQueries({ queryKey: ['bookings'] })
        queryClient.invalidateQueries({ queryKey: ['my-bookings'] })
        queryClient.invalidateQueries({ queryKey: ['booking', data.bookingId] })
        useToastStore.getState().addToast(data.message, 'info')
      }
      s.on('booking:created', handleBookingEvent)
      s.on('booking:status_changed', handleBookingEvent)
      s.on('booking:quoted', handleBookingEvent)
      s.on('booking:quote_accepted', handleBookingEvent)
      s.on('booking:note_added', handleBookingEvent)
      s.on('booking:reviewed', handleBookingEvent)

      return () => {
        recovery.dispose()
        s.off('session:expired', handleExpiry)
        s.off('notification:new', handleNotification)
        s.off('badges:update', handleBadgeUpdate)
        s.off('booking:created', handleBookingEvent)
        s.off('booking:status_changed', handleBookingEvent)
        s.off('booking:quoted', handleBookingEvent)
        s.off('booking:quote_accepted', handleBookingEvent)
        s.off('booking:note_added', handleBookingEvent)
        s.off('booking:reviewed', handleBookingEvent)
        // Logout may have already torn this socket down (and reset the count);
        // only cleanups against the live socket keep the refcount balanced.
        if (socket === s) {
          connectionCount--
          // Only fully disconnect when all consumers have unmounted
          if (connectionCount <= 0) {
            disconnectSocket()
          }
        }
      }
    } else {
      disconnectSocket()
    }
  }, [isAuthenticated, token, queryClient])

  // Listen for logout to disconnect
  useEffect(() => {
    const unsub = useAuthStore.subscribe((state, prevState) => {
      if (prevState.isAuthenticated && !state.isAuthenticated) {
        disconnectSocket()
      }
    })
    return unsub
  }, [])

  return isAuthenticated ? socketInstance : null
}

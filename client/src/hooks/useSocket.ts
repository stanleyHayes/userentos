import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'

let socket: Socket | null = null
let connectionCount = 0

function getServerUrl(): string {
  // In production, use the API URL (without /api suffix)
  const apiUrl = import.meta.env.VITE_SOCKET_URL
  if (apiUrl) return apiUrl
  // In dev, socket connects to the server directly (not through Vite proxy)
  return import.meta.env.DEV ? 'http://localhost:3002' : window.location.origin
}

function connectSocket(token: string): Socket {
  if (socket?.connected) return socket

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

  socket.on('connect_error', (err) => {
    console.warn('[Socket] Connection error:', err.message)
  })

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason)
  })

  return socket
}

function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
  connectionCount = 0
}

/**
 * Singleton socket hook. Connects when authenticated, disconnects on logout.
 * Returns the socket instance (or null if not connected).
 */
export function useSocket(): Socket | null {
  const token = useAuthStore((s) => s.token)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const socketRef = useRef<Socket | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (isAuthenticated && token) {
      connectionCount++
      const s = connectSocket(token)
      socketRef.current = s

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
        connectionCount--
        s.off('notification:new', handleNotification)
        s.off('badges:update', handleBadgeUpdate)
        s.off('booking:created', handleBookingEvent)
        s.off('booking:status_changed', handleBookingEvent)
        s.off('booking:quoted', handleBookingEvent)
        s.off('booking:quote_accepted', handleBookingEvent)
        s.off('booking:note_added', handleBookingEvent)
        s.off('booking:reviewed', handleBookingEvent)
        // Only fully disconnect when all consumers have unmounted
        if (connectionCount <= 0) {
          disconnectSocket()
        }
      }
    } else {
      disconnectSocket()
      socketRef.current = null
    }
  }, [isAuthenticated, token, queryClient])

  // Listen for logout to disconnect
  useEffect(() => {
    const unsub = useAuthStore.subscribe((state, prevState) => {
      if (prevState.isAuthenticated && !state.isAuthenticated) {
        disconnectSocket()
        socketRef.current = null
      }
    })
    return unsub
  }, [])

  return isAuthenticated ? socket : null
}

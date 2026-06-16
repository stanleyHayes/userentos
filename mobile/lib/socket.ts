import { io, Socket } from 'socket.io-client'

// For physical device: use your Mac's local IP
// For simulator: 'http://localhost:3002' works fine
// const SERVER_URL = __DEV__ ? 'http://10.58.101.108:3002' : '...'
const SERVER_URL = __DEV__ ? 'http://localhost:3002' : process.env.EXPO_PUBLIC_API_URL!

let socket: Socket | null = null

/**
 * Get the current socket instance (may be null if not connected).
 */
export function getSocket(): Socket | null {
  return socket
}

/**
 * Connect to the Socket.IO server with the given auth token.
 * Returns the connected socket instance. Re-uses existing connection if already connected.
 */
export function connectSocket(token: string): Socket {
  if (socket?.connected) return socket

  // Clean up any stale socket before creating a new one
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
  }

  socket = io(SERVER_URL, {
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

/**
 * Disconnect from the Socket.IO server and clean up listeners.
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
}

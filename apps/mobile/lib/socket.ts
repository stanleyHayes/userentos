import Constants from 'expo-constants'
import { io, Socket } from 'socket.io-client'

// Resolve the Socket.IO origin the same way lib/api.ts resolves the REST base:
//  - production: EXPO_PUBLIC_API_URL (warn loudly if missing, never pass undefined to io())
//  - dev: derive the dev machine's host from Expo's hostUri so a PHYSICAL device
//    reaches the server (localhost resolves to the device itself).
function resolveServerUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL
  if (!__DEV__) {
    if (!envUrl) console.warn('[socket] EXPO_PUBLIC_API_URL is not set — realtime will not connect.')
    return envUrl ?? 'http://localhost:3002'
  }
  if (envUrl) return envUrl
  const hostUri = Constants.expoConfig?.hostUri
  const host = hostUri ? hostUri.split(':')[0] : 'localhost'
  return `http://${host}:3002`
}

const SERVER_URL = resolveServerUrl()

let socket: Socket | null = null
let activeToken: string | null = null

/**
 * Get the current socket instance (may be null if not connected).
 */
export function getSocket(): Socket | null {
  return socket
}

/**
 * Connect to the Socket.IO server with the given auth token.
 * Re-uses the existing connection UNLESS the token changed (e.g. after a
 * silent refresh) — a stale token makes every auto-reconnect fail forever.
 */
export function connectSocket(token: string): Socket {
  if (socket?.connected && activeToken === token) return socket

  // Clean up any stale socket before creating a new one
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
  activeToken = token

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
  activeToken = null
}

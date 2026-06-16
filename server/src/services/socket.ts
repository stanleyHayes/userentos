import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import { config } from '../config/index.js'
import { Conversation } from '../models/Conversation.js'

let io: Server | null = null

// userId → Set of socket IDs (one user can have multiple tabs/devices)
const onlineUsers = new Map<string, Set<string>>()

const ALWAYS_ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:3000',
])

function getAllowedOrigins(): string[] {
  const envOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  return [...ALWAYS_ALLOWED_ORIGINS, ...envOrigins]
}

export function initSocket(httpServer: HttpServer): Server {
  const allowedOrigins = getAllowedOrigins()

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins.length ? allowedOrigins : '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  })

  // Auth middleware — verify JWT on connection
  io.use((socket, next) => {
    const token = socket.handshake.auth.token
    if (!token) return next(new Error('Authentication required'))

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as { userId: string }
      ;(socket as unknown as { userId: string }).userId = decoded.userId
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', (socket: Socket) => {
    const userId = (socket as unknown as { userId: string }).userId
    console.log(`[Socket] User ${userId} connected (${socket.id})`)

    // Track online status
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set())
    onlineUsers.get(userId)!.add(socket.id)

    // Join personal room for direct events
    socket.join(`user:${userId}`)

    // Broadcast online status
    io!.emit('user:online', { userId })

    // Conversation rooms — only a participant may join, otherwise any client could
    // join any chat:<id> room and receive every message (eavesdropping / IDOR).
    const joinedConversations = new Set<string>()
    socket.on('join:conversation', async (conversationId: string) => {
      try {
        const convo = await Conversation.findById(conversationId).select('participants').lean()
        if (convo && (convo.participants as string[]).includes(userId)) {
          socket.join(`chat:${conversationId}`)
          joinedConversations.add(conversationId)
        }
      } catch { /* ignore malformed conversation ids */ }
    })

    socket.on('leave:conversation', (conversationId: string) => {
      socket.leave(`chat:${conversationId}`)
      joinedConversations.delete(conversationId)
    })

    // Typing indicators — only broadcast into rooms this socket has actually joined.
    socket.on('typing:start', ({ conversationId }: { conversationId: string }) => {
      if (!joinedConversations.has(conversationId)) return
      socket.to(`chat:${conversationId}`).emit('typing:start', { userId, conversationId })
    })

    socket.on('typing:stop', ({ conversationId }: { conversationId: string }) => {
      if (!joinedConversations.has(conversationId)) return
      socket.to(`chat:${conversationId}`).emit('typing:stop', { userId, conversationId })
    })

    // Get online users
    socket.on('get:online', () => {
      const online = [...onlineUsers.keys()]
      socket.emit('online:list', online)
    })

    socket.on('disconnect', () => {
      const sockets = onlineUsers.get(userId)
      if (sockets) {
        sockets.delete(socket.id)
        if (sockets.size === 0) {
          onlineUsers.delete(userId)
          io!.emit('user:offline', { userId })
        }
      }
      console.log(`[Socket] User ${userId} disconnected (${socket.id})`)
    })
  })

  return io
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO not initialized')
  return io
}

export function isUserOnline(userId: string): boolean {
  return onlineUsers.has(userId) && onlineUsers.get(userId)!.size > 0
}

export function getOnlineUserIds(): string[] {
  return [...onlineUsers.keys()]
}

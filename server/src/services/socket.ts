import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import { config } from '../config/index.js'
import { Conversation } from '../models/Conversation.js'

let io: Server | null = null

// userId → Set of socket IDs (one user can have multiple tabs/devices)
const onlineUsers = new Map<string, Set<string>>()

const DEV_ORIGINS = new Set([
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
  // Dev origins only outside production — same policy as the HTTP CORS setup.
  return process.env.NODE_ENV === 'production' ? envOrigins : [...DEV_ORIGINS, ...envOrigins]
}

/** User ids sharing at least one conversation with `userId` — presence is
 * only ever disclosed to these users, never broadcast platform-wide. */
async function getContacts(userId: string): Promise<Set<string>> {
  const convos = await Conversation.find({ participants: userId }).select('participants').lean()
  const contacts = new Set<string>()
  for (const convo of convos) {
    for (const participant of convo.participants as string[]) {
      if (participant !== userId) contacts.add(participant)
    }
  }
  return contacts
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

  // Auth middleware — verify JWT on connection. Only full session tokens may
  // connect (pre-MFA / reset / download tokens are signed with the same secret
  // but must never open a realtime channel).
  io.use((socket, next) => {
    const token = socket.handshake.auth.token
    if (!token) return next(new Error('Authentication required'))

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as { userId: string; purpose?: string }
      if (decoded.purpose !== 'session') return next(new Error('Invalid token'))
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

    // Tell only this user's chat contacts that they came online — presence is
    // not broadcast platform-wide.
    getContacts(userId)
      .then((contacts) => {
        for (const contactId of contacts) {
          io!.to(`user:${contactId}`).emit('user:online', { userId })
        }
      })
      .catch(() => { /* presence is best-effort */ })

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

    // Online status — only for users the requester actually chats with.
    socket.on('get:online', () => {
      getContacts(userId)
        .then((contacts) => {
          const online = [...contacts].filter((id) => onlineUsers.has(id))
          socket.emit('online:list', online)
        })
        .catch(() => socket.emit('online:list', []))
    })

    socket.on('disconnect', () => {
      const sockets = onlineUsers.get(userId)
      if (sockets) {
        sockets.delete(socket.id)
        if (sockets.size === 0) {
          onlineUsers.delete(userId)
          getContacts(userId)
            .then((contacts) => {
              for (const contactId of contacts) {
                io!.to(`user:${contactId}`).emit('user:offline', { userId })
              }
            })
            .catch(() => { /* presence is best-effort */ })
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

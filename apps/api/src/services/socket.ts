import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { RevokedSession, isSessionRevoked } from '../models/RevokedSession.js'
import { Conversation } from '../models/Conversation.js'
import { scheduleTokenExpiry } from './tokenExpiry.js'
import { sessionVersionFilter, biometricVersionFilter } from './sessionVersion.js'
import { blockedContacts, contactBlocked } from './userBlocks.js'

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
  const blocked = await blockedContacts(userId)
  for (const convo of convos) {
    for (const participant of convo.participants as string[]) {
      if (participant !== userId && !blocked.has(participant)) contacts.add(participant)
    }
  }
  return contacts
}

export interface RealtimeOptions {
  /** Every local socket is re-checked against its account this often, in batched queries. */
  revalidateIntervalMs?: number
  /** An incoming packet re-checks its sender first when the last check is older than this. */
  packetRecheckMs?: number
  /** Watch User and RevokedSession for revocations. Needs a replica set; without one the sweep alone applies. */
  watchChanges?: boolean
  /** First restart delay after a change stream fails; it doubles up to a minute. */
  watchRetryMs?: number
}

const DEFAULT_OPTIONS: Required<RealtimeOptions> = {
  revalidateIntervalMs: 30_000,
  packetRecheckMs: 15_000,
  watchChanges: true,
  watchRetryMs: 1_000,
}

/**
 * A client signs out on 'session:revoked'. A suspended account keeps a
 * restricted HTTP session, so its sockets get 'account:suspended' instead.
 */
type Ending = { event: 'session:revoked' } | { event: 'account:suspended'; suspendedAt: Date }

function endSocket(socket: Socket, ending: Ending): void {
  if (!socket.connected) return
  if (ending.event === 'account:suspended') socket.emit('account:suspended', { suspendedAt: ending.suspendedAt.toISOString() })
  else socket.emit('session:revoked')
  socket.disconnect(true)
}

const CHECK_BATCH = 500

/**
 * Re-check sockets against their accounts in batched queries and end each one
 * whose token no longer holds: session or biometric version bumped, account
 * deleted or suspended, or that device signed out.
 */
async function revalidateSockets(sockets: Iterable<Socket>): Promise<void> {
  const live = [...sockets].filter(socket => socket.connected && socket.data.userId)
  for (let start = 0; start < live.length; start += CHECK_BATCH) {
    const batch = live.slice(start, start + CHECK_BATCH)
    const checkedAt = Date.now()
    const ids = [...new Set(batch.map(socket => socket.data.userId as string))]
    const sids = [...new Set(batch.map(socket => socket.data.sid as string | undefined).filter((sid): sid is string => !!sid))]
    const [accounts, revoked] = await Promise.all([
      // The soft-delete hook leaves deleted accounts out, so they read as missing.
      User.find({ _id: { $in: ids } }).select('sessionVersion biometricVersion suspendedAt').lean(),
      sids.length ? RevokedSession.find({ sid: { $in: sids } }).select('sid').lean() : [],
    ])
    const byId = new Map(accounts.map(account => [String(account._id), account]))
    const signedOut = new Set(revoked.map(row => row.sid))
    for (const socket of batch) {
      const account = byId.get(socket.data.userId)
      if (!account
        || (account.sessionVersion ?? 0) !== socket.data.sessionVersion
        || (socket.data.biometricVersion !== undefined && (account.biometricVersion ?? 0) !== socket.data.biometricVersion)
        || (socket.data.sid && signedOut.has(socket.data.sid))) {
        endSocket(socket, { event: 'session:revoked' })
      } else if (account.suspendedAt) {
        endSocket(socket, { event: 'account:suspended', suspendedAt: account.suspendedAt })
      } else {
        socket.data.validatedAt = Math.max(socket.data.validatedAt ?? 0, checkedAt)
      }
    }
  }
}

/** Local sockets in a room (the default in-memory adapter holds no others). */
function socketsIn(server: Server, room: string): Socket[] {
  const nsp = server.of('/')
  return [...nsp.adapter.rooms.get(room) ?? []]
    .map(id => nsp.sockets.get(id))
    .filter((socket): socket is Socket => socket !== undefined)
}

/** Account fields whose change can end a session. Unsuspending or editing a profile never does. */
const ACCOUNT_REVOCATIONS = [{
  $match: {
    $or: [
      { operationType: { $in: ['delete', 'replace'] } },
      ...['sessionVersion', 'biometricVersion', 'deletedAt', 'suspendedAt'].map(field => ({
        operationType: 'update', [`updateDescription.updatedFields.${field}`]: { $exists: true },
      })),
    ],
  },
}]
const DEVICE_SIGN_OUTS = [{ $match: { operationType: 'insert' } }]
const WATCH_RETRY_MAX_MS = 60_000
let loggedUnsupported = false

type WatchStream = ReturnType<typeof User.watch>

/** Change streams need a replica set; a standalone server refuses the stage outright. */
function changeStreamsUnsupported(err: unknown): boolean {
  const { code, message } = (err ?? {}) as { code?: number; message?: string }
  return code === 40573 || /only supported on replica sets/i.test(message ?? '')
}

/**
 * Keep one change stream open, restarting it with backoff after an error and
 * sweeping once it is live again to catch anything missed while it was down.
 * Without change streams (standalone MongoDB) it logs once and stops, and the
 * periodic sweep alone applies. `ready` settles once the stream is live (or
 * given up), which tests wait for.
 */
function keepWatching(label: string, open: () => WatchStream, onChange: (change: unknown) => void, onRestart: () => void, retryMs: number) {
  let stream: WatchStream | null = null
  let stopped = false
  let restarted = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let delay = retryMs
  let markReady!: () => void
  const ready = new Promise<void>(resolve => { markReady = resolve })

  function retry(reason: string) {
    console.warn(`[Socket] ${label} change stream stopped (${reason}); restarting in ${delay}ms`)
    timer = setTimeout(() => { timer = undefined; restarted = true; start() }, delay)
    timer.unref()
    delay = Math.min(delay * 2, WATCH_RETRY_MAX_MS)
  }

  function start() {
    if (stopped) return
    let current: WatchStream | undefined
    let failed = false
    const fail = (err?: unknown) => {
      if (failed || stopped) return
      failed = true
      stream = null
      current?.close().catch(() => { /* already closed */ })
      if (changeStreamsUnsupported(err)) {
        if (!loggedUnsupported) console.warn('[Socket] Change streams are unavailable (standalone MongoDB?); revocations from other instances or direct edits reach sockets through the periodic sweep only')
        loggedUnsupported = true
        markReady()
        return
      }
      retry(err instanceof Error ? err.message : 'closed')
    }
    try {
      current = open()
      stream = current
      // The first resume token arrives with the opening aggregate's reply: the
      // stream is live from here on. Later ones are per-batch heartbeats.
      current.on('resumeTokenChanged', () => {
        delay = retryMs
        markReady()
        if (restarted) { restarted = false; onRestart() }
      })
      current.on('change', onChange)
      current.on('error', fail)
      current.on('close', () => fail())
    } catch (err) {
      fail(err)
    }
  }

  start()
  return {
    ready,
    async stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      markReady()
      const current = stream
      stream = null
      if (current) await current.close().catch(() => { /* already closed */ })
    },
  }
}

interface RealtimeChecks { ready: Promise<void>; stop: () => Promise<void> }
const realtimeChecks = new WeakMap<Server, RealtimeChecks>()

/**
 * Revocation must reach sockets however it happened: a direct disconnect call
 * on this instance, a revocation on another instance, a direct database edit
 * or a code path that never calls disconnect. Three layers, cheapest first:
 * a change stream per process on User and RevokedSession (about a second), a
 * batched sweep of every local socket, and a throttled re-check before a
 * packet is handled.
 */
function startRealtimeChecks(server: Server, options: Required<RealtimeOptions>): RealtimeChecks {
  let sweeping = false
  const sweep = async () => {
    if (sweeping) return
    sweeping = true
    try { await revalidateSockets(server.of('/').sockets.values()) }
    catch (err) { console.warn(`[Socket] Session sweep failed: ${(err as Error).message}`) }
    finally { sweeping = false }
  }
  const timer = setInterval(() => { void sweep() }, options.revalidateIntervalMs)
  timer.unref()

  const watchers = options.watchChanges ? [
    keepWatching('account', () => User.watch(ACCOUNT_REVOCATIONS), change => {
      const userId = (change as { documentKey?: { _id?: unknown } }).documentKey?._id
      if (userId === undefined) return
      revalidateSockets(socketsIn(server, `session:${String(userId)}`))
        .catch(err => console.warn(`[Socket] Session re-check failed: ${(err as Error).message}`))
    }, () => { void sweep() }, options.watchRetryMs),
    keepWatching('device sign-out', () => RevokedSession.watch(DEVICE_SIGN_OUTS), change => {
      const sid = (change as { fullDocument?: { sid?: unknown } }).fullDocument?.sid
      if (typeof sid === 'string') for (const socket of socketsIn(server, `sid:${sid}`)) endSocket(socket, { event: 'session:revoked' })
    }, () => { void sweep() }, options.watchRetryMs),
  ] : []

  let stopping: Promise<void> | undefined
  return {
    ready: Promise.all(watchers.map(watcher => watcher.ready)).then(() => undefined),
    stop() {
      stopping ??= (async () => {
        clearInterval(timer)
        await Promise.all(watchers.map(watcher => watcher.stop()))
      })()
      return stopping
    },
  }
}

/**
 * One API process today (render.yaml runs a single instance), and the default
 * in-memory adapter only reaches this process's sockets: room emits and
 * disconnectUser/disconnectBiometricUser/disconnectSession act locally.
 * Revocation still reaches every instance through the change-stream watcher
 * and sweep below, but notifications, chat and presence would not. Before
 * running a second instance, add a shared adapter (@socket.io/mongo-adapter
 * or a Redis adapter), websocket-only transports or sticky sessions, presence
 * through fetchSockets instead of `onlineUsers`, and a single scheduler runner.
 */
export function initSocket(httpServer: HttpServer, options: RealtimeOptions = {}): Server {
  const allowedOrigins = getAllowedOrigins()
  const settings = { ...DEFAULT_OPTIONS, ...options }

  const server = new Server(httpServer, {
    cors: {
      origin: allowedOrigins.length ? allowedOrigins : '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  })
  io = server

  // Auth middleware — verify JWT on connection. Only full session tokens may
  // connect (pre-MFA / reset / download tokens are signed with the same secret
  // but must never open a realtime channel).
  server.use(async (socket, next) => {
    const token = socket.handshake.auth.token
    if (!token) return next(new Error('Authentication required'))

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as { userId: string; purpose?: string; sessionVersion?: number; biometricVersion?: number; sid?: unknown; exp?: number }
      if (typeof decoded.exp !== 'number' || !Number.isSafeInteger(decoded.exp * 1000)) return next(new Error('Invalid token'))
      socket.data.expiresAt = decoded.exp * 1000
      const accountFilter = { _id: decoded.userId, ...sessionVersionFilter(decoded.sessionVersion), ...biometricVersionFilter(decoded.biometricVersion), deletedAt: { $exists: false }, suspendedAt: { $exists: false } }
      if (decoded.purpose !== 'session' || !(await User.exists(accountFilter)) || await isSessionRevoked(decoded.sid)) return next(new Error('Invalid token'))
      socket.data.accountFilter = accountFilter
      socket.data.biometric = decoded.biometricVersion !== undefined
      // The claims the sweep compares against the account.
      socket.data.userId = decoded.userId
      socket.data.sessionVersion = decoded.sessionVersion ?? 0
      socket.data.biometricVersion = decoded.biometricVersion
      socket.data.sid = decoded.sid
      ;(socket as unknown as { userId: string }).userId = decoded.userId
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  server.on('connection', async (socket: Socket) => {
    const userId = (socket as unknown as { userId: string }).userId
    const cancelExpiry = scheduleTokenExpiry(socket.data.expiresAt, () => {
      socket.emit('session:expired')
      socket.disconnect(true)
    })
    socket.once('disconnect', cancelExpiry)
    let finishAdmission!: () => void
    const admission = new Promise<void>(resolve => { finishAdmission = resolve })
    let recheck: Promise<void> | undefined
    // Buffer early client packets until private-room admission and handlers
    // exist. After that, a packet re-checks the account when the last check
    // is stale, so a revocation this instance never heard about cannot keep
    // a socket emitting until the sweep comes round.
    socket.use((_packet, next) => {
      void admission.then(async () => {
        if (Date.now() >= socket.data.expiresAt) socket.disconnect(true)
        else if (socket.connected && Date.now() - socket.data.validatedAt >= settings.packetRecheckMs) {
          recheck ??= revalidateSockets([socket]).finally(() => { recheck = undefined })
          try { await recheck } catch { next(new Error('Session check failed')); return }
        }
        next(socket.connected ? undefined : new Error('Invalid token'))
      })
    })
    try {
      // Revocation can now find this socket, but it receives no private events yet.
      await socket.join(`session:${userId}`)
      if (socket.data.biometric) await socket.join(`biometric:${userId}`)
      if (socket.data.sid) await socket.join(`sid:${socket.data.sid}`)
      const checkedAt = Date.now()
      const active = await User.exists(socket.data.accountFilter) && !await isSessionRevoked(socket.data.sid)
      // Revoked during the handshake: end it with the notice the client acts on.
      if (!active && socket.connected) await revalidateSockets([socket])
      if (!active || !socket.connected || Date.now() >= socket.data.expiresAt) {
        socket.disconnect(true); finishAdmission(); return
      }
      socket.data.validatedAt = checkedAt
    } catch {
      socket.disconnect(true); finishAdmission(); return
    }
    console.log(`[Socket] User ${userId} connected (${socket.id})`)

    // Track online status
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set())
    onlineUsers.get(userId)!.add(socket.id)

    // Join personal room for direct events
    void socket.join(`user:${userId}`)

    // Tell only this user's chat contacts that they came online — presence is
    // not broadcast platform-wide.
    getContacts(userId)
      .then((contacts) => {
        for (const contactId of contacts) {
          server.to(`user:${contactId}`).emit('user:online', { userId })
        }
      })
      .catch(() => { /* presence is best-effort */ })

    // Conversation rooms — only a participant may join, otherwise any client could
    // join any chat:<id> room and receive every message (eavesdropping / IDOR).
    const joinedConversations = new Set<string>()
    socket.on('join:conversation', async (conversationId: unknown) => {
      if (typeof conversationId !== 'string') return
      try {
        const convo = await Conversation.findById(conversationId).select('participants').lean()
        const otherId = convo?.participants.find(id => id !== userId)
        if (convo && otherId && convo.participants.includes(userId) && !await contactBlocked(userId, otherId)) {
          // Closed while the lookup ran. Socket.IO 4 already ignores the join;
          // this keeps the handler from relying on that.
          if (!socket.connected) return
          void socket.join(`chat:${conversationId}`)
          joinedConversations.add(conversationId)
        }
      } catch { /* ignore malformed conversation ids */ }
    })

    socket.on('leave:conversation', (conversationId: unknown) => {
      if (typeof conversationId !== 'string') return
      void socket.leave(`chat:${conversationId}`)
      joinedConversations.delete(conversationId)
    })

    // Typing indicators — only broadcast into rooms this socket has actually joined.
    // Payloads come straight from the client: socket.io calls listeners outside
    // any try/catch, so a throw here (destructuring a missing payload) used to
    // exit the whole API process.
    const typingConversation = (payload: unknown): string | null => {
      const id = (payload as { conversationId?: unknown } | null | undefined)?.conversationId
      return typeof id === 'string' && joinedConversations.has(id) ? id : null
    }
    socket.on('typing:start', (payload: unknown) => {
      const conversationId = typingConversation(payload)
      if (conversationId) socket.to(`chat:${conversationId}`).emit('typing:start', { userId, conversationId })
    })

    socket.on('typing:stop', (payload: unknown) => {
      const conversationId = typingConversation(payload)
      if (conversationId) socket.to(`chat:${conversationId}`).emit('typing:stop', { userId, conversationId })
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
                server.to(`user:${contactId}`).emit('user:offline', { userId })
              }
            })
            .catch(() => { /* presence is best-effort */ })
        }
      }
      console.log(`[Socket] User ${userId} disconnected (${socket.id})`)
    })
    finishAdmission()
  })

  const checks = startRealtimeChecks(server, settings)
  realtimeChecks.set(server, checks)
  // However the server ends up closed, the watcher and sweep go with it.
  httpServer.once('close', () => { void checks.stop() })
  return server
}

/** Settles once the revocation change streams are live (or unavailable). */
export function realtimeChecksReady(server: Server): Promise<void> {
  return realtimeChecks.get(server)?.ready ?? Promise.resolve()
}

/**
 * Graceful shutdown: stop the revocation watcher, disconnect every client
 * (they reconnect to the next instance) and close the HTTP server. A bare
 * httpServer.close() never finishes while upgraded WebSockets stay open.
 */
export async function shutdownRealtime(server: Server | null, httpServer: HttpServer): Promise<void> {
  if (!server) {
    await new Promise<void>(resolve => httpServer.close(() => resolve()))
    return
  }
  await realtimeChecks.get(server)?.stop()
  await server.close()
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

/** Tell every local socket in a room it was signed out, then close it. */
function revokeRoom(room: string, notify: boolean): void {
  if (!io) return
  if (notify) io.to(room).emit('session:revoked')
  io.in(room).disconnectSockets(true)
}

/**
 * Disconnect every local device of an account. Clients sign out on the
 * 'session:revoked' sent first; pass notify: false when the caller has already
 * told them something else (suspension keeps a restricted session).
 */
export function disconnectUser(userId: string, { notify = true }: { notify?: boolean } = {}): void {
  revokeRoom(`session:${userId}`, notify)
}

/** Disconnect tagged biometric sessions while preserving ordinary logins. */
export function disconnectBiometricUser(userId: string): void {
  revokeRoom(`biometric:${userId}`, true)
}

/**
 * Disconnect one device's session (one sign-in, across its token rotations).
 * notify: false closes it quietly, for the device that is about to receive a
 * replacement token pair and must not sign itself out.
 */
export function disconnectSession(sid: string, { notify = true }: { notify?: boolean } = {}): void {
  revokeRoom(`sid:${sid}`, notify)
}

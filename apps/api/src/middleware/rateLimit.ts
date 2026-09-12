import rateLimit, { ipKeyGenerator, type Store } from 'express-rate-limit'
import RedisStore from 'rate-limit-redis'
import Redis from 'ioredis'
import type { Request } from 'express'
import { envOptional } from '../utils/env.js'
import { logger } from '../utils/logger.js'

/**
 * Shared rate-limit state, when REDIS_URL is configured.
 *
 * express-rate-limit defaults to an in-process MemoryStore, which counts
 * requests PER INSTANCE. On a multi-instance deployment that quietly
 * multiplies every limit by the instance count: "5 login attempts per 15
 * minutes" becomes 5 x N, and the brute-force protection the number was
 * chosen for is not what is actually enforced.
 *
 * Falls back to the in-memory store when unset, which is correct for local
 * development and for a single instance. ioredis speaks `rediss://` as well
 * as `redis://`, so a Render external URL works unchanged.
 */
let sharedClient: Redis | null = null

function redisClient(): Redis | null {
  const url = envOptional('REDIS_URL')
  if (!url) return null
  if (sharedClient) return sharedClient

  try {
    sharedClient = new Redis(url, {
      /*
       * The offline queue must stay ON. rate-limit-redis loads a Lua script
       * during store init, which runs at module load — before the connection
       * is up. With the queue disabled that command throws "Stream isn't
       * writeable", store init fails, and every request through the limiter
       * returns 500. The log still says "Redis connected", so it looks fine.
       *
       * commandTimeout is what keeps a request from hanging on a dead Redis:
       * the command fails fast instead of queueing forever.
       */
      enableOfflineQueue: true,
      commandTimeout: 1000,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    })
    sharedClient.on('error', (err) => {
      logger.warn(`[RateLimit] Redis error: ${err.message}`)
    })
    sharedClient.on('connect', () => {
      logger.info('[RateLimit] Redis connected — limits are shared across instances')
    })
    return sharedClient
  } catch (err) {
    logger.warn(`[RateLimit] Redis init failed, using per-instance memory: ${(err as Error).message}`)
    return null
  }
}

/**
 * A Redis-backed store, or undefined to let express-rate-limit use memory.
 *
 * Each limiter gets its own key prefix so their windows cannot collide.
 */
function store(prefix: string): Store | undefined {
  const client = redisClient()
  if (!client) return undefined
  return new RedisStore({
    prefix: `rl:${prefix}:`,
    sendCommand: (...args: string[]) => client.call(...(args as [string, ...string[]])) as Promise<never>,
  })
}

/** Logged once at boot so the deployment's actual behaviour is visible. */
export function rateLimitBackend(): 'redis' | 'memory' {
  return envOptional('REDIS_URL') ? 'redis' : 'memory'
}

/**
 * Login / password limiter — strict: 5 requests per 15 minutes per IP.
 * In non-production environments the limit is relaxed so E2E test suites
 * (which may log in multiple times per worker) don't get blocked.
 */
const isProd = process.env.NODE_ENV === 'production'
export const loginLimiter = rateLimit({
  store: store('login'),
  windowMs: isProd ? 15 * 60 * 1000 : 60 * 1000,
  limit: isProd ? 5 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  // Fail OPEN if the store errors. A rate limiter that 500s every
  // request during a Redis blip is a worse outage than briefly
  // unlimited traffic — it takes the whole API down to protect it.
  passOnStoreError: true,
  message: { success: false, error: 'Too many authentication attempts. Please try again later.' },
})

/**
 * Registration limiter — strict in production: account creation is free of
 * credential checks, so without this it enables email enumeration and spam.
 */
export const registerLimiter = rateLimit({
  store: store('register'),
  windowMs: isProd ? 60 * 60 * 1000 : 60 * 1000,
  limit: isProd ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  // Fail OPEN if the store errors. A rate limiter that 500s every
  // request during a Redis blip is a worse outage than briefly
  // unlimited traffic — it takes the whole API down to protect it.
  passOnStoreError: true,
  message: { success: false, error: 'Too many accounts created. Please try again later.' },
})

/**
 * Public endpoint limiter — 60 requests per 1 minute per IP in production.
 * Relaxed in dev/test so page refreshes and E2E suites don't get blocked.
 */
export const publicLimiter = rateLimit({
  store: store('public'),
  windowMs: isProd ? 60 * 1000 : 60 * 1000,
  limit: isProd ? 60 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  // Fail OPEN if the store errors. A rate limiter that 500s every
  // request during a Redis blip is a worse outage than briefly
  // unlimited traffic — it takes the whole API down to protect it.
  passOnStoreError: true,
  message: { success: false, error: 'Too many requests. Please slow down.' },
})

/**
 * Write limiter — 30 requests per 1 minute per authenticated user in production.
 * Relaxed in dev/test for E2E suites that perform multiple writes in sequence.
 */
export const writeLimiter = rateLimit({
  store: store('write'),
  windowMs: isProd ? 60 * 1000 : 60 * 1000,
  limit: isProd ? 30 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  // Fail OPEN if the store errors. A rate limiter that 500s every
  // request during a Redis blip is a worse outage than briefly
  // unlimited traffic — it takes the whole API down to protect it.
  passOnStoreError: true,
  keyGenerator: (req: Request) => {
    // Prefer authenticated user id; fall back to IPv6-safe ip key generator.
    const userId = req.user?.userId
    if (userId) return `user:${userId}`
    return ipKeyGenerator(req.ip ?? '')
  },
  message: { success: false, error: 'Too many write requests. Please slow down.' },
})

/**
 * Baseline API limiter — generous (300 req/min per IP in production), applied
 * to all /api routes so currently-unlimited authenticated GET endpoints aren't
 * wide open. Stricter limiters above still apply on top of this one.
 */
export const apiLimiter = rateLimit({
  store: store('api'),
  windowMs: 60 * 1000,
  limit: isProd ? 300 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  // Fail OPEN if the store errors. A rate limiter that 500s every
  // request during a Redis blip is a worse outage than briefly
  // unlimited traffic — it takes the whole API down to protect it.
  passOnStoreError: true,
  message: { success: false, error: 'Too many requests. Please slow down.' },
})

/**
 * AI/LLM limiter — strict, because each request triggers a paid Claude/OpenAI
 * call. Without this, a scripted loop runs up unbounded provider bills and can
 * exhaust quota for everyone. Keyed by user when authenticated, else by IP.
 */
export const aiLimiter = rateLimit({
  store: store('ai'),
  windowMs: 60 * 1000,
  limit: isProd ? 15 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  // Fail OPEN if the store errors. A rate limiter that 500s every
  // request during a Redis blip is a worse outage than briefly
  // unlimited traffic — it takes the whole API down to protect it.
  passOnStoreError: true,
  keyGenerator: (req: Request) => {
    const userId = req.user?.userId
    if (userId) return `ai:user:${userId}`
    return ipKeyGenerator(req.ip ?? '')
  },
  message: { success: false, error: 'Too many AI requests. Please wait a moment before trying again.' },
})

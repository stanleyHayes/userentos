import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import type { Request } from 'express'

/**
 * Login / password limiter — strict: 5 requests per 15 minutes per IP.
 * In non-production environments the limit is relaxed so E2E test suites
 * (which may log in multiple times per worker) don't get blocked.
 */
const isProd = process.env.NODE_ENV === 'production'
export const loginLimiter = rateLimit({
  windowMs: isProd ? 15 * 60 * 1000 : 60 * 1000,
  limit: isProd ? 5 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many authentication attempts. Please try again later.' },
})

/**
 * Registration limiter — strict in production: account creation is free of
 * credential checks, so without this it enables email enumeration and spam.
 */
export const registerLimiter = rateLimit({
  windowMs: isProd ? 60 * 60 * 1000 : 60 * 1000,
  limit: isProd ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many accounts created. Please try again later.' },
})

/**
 * Public endpoint limiter — 60 requests per 1 minute per IP in production.
 * Relaxed in dev/test so page refreshes and E2E suites don't get blocked.
 */
export const publicLimiter = rateLimit({
  windowMs: isProd ? 60 * 1000 : 60 * 1000,
  limit: isProd ? 60 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please slow down.' },
})

/**
 * Write limiter — 30 requests per 1 minute per authenticated user in production.
 * Relaxed in dev/test for E2E suites that perform multiple writes in sequence.
 */
export const writeLimiter = rateLimit({
  windowMs: isProd ? 60 * 1000 : 60 * 1000,
  limit: isProd ? 30 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Prefer authenticated user id; fall back to IPv6-safe ip key generator.
    const userId = req.user?.userId
    if (userId) return `user:${userId}`
    return ipKeyGenerator(req.ip ?? '')
  },
  message: { success: false, error: 'Too many write requests. Please slow down.' },
})

/**
 * AI/LLM limiter — strict, because each request triggers a paid Claude/OpenAI
 * call. Without this, a scripted loop runs up unbounded provider bills and can
 * exhaust quota for everyone. Keyed by user when authenticated, else by IP.
 */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isProd ? 15 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const userId = req.user?.userId
    if (userId) return `ai:user:${userId}`
    return ipKeyGenerator(req.ip ?? '')
  },
  message: { success: false, error: 'Too many AI requests. Please wait a moment before trying again.' },
})

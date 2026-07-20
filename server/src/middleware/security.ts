import type { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'

/**
 * Attach a unique request ID to every incoming request.
 * Useful for tracing logs across distributed services.
 */
export function requestId(req: Request, res: Response, next: NextFunction) {
  // Honor a client-supplied id only after sanitizing — CR/LF or other invalid
  // chars make res.setHeader throw. Otherwise trace with a fresh id.
  const supplied = req.headers['x-request-id'] as string | undefined
  const sanitized = supplied?.replace(/[^A-Za-z0-9-_]/g, '').slice(0, 64)
  const id = sanitized || randomUUID()
  ;(req as unknown as { id: string }).id = id
  res.setHeader('X-Request-Id', id)
  next()
}

/**
 * Security headers middleware (lightweight alternative to helmet).
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' ws: wss:;",
  )
  next()
}

/**
 * Catch-all 404 handler for undefined API routes.
 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: `Cannot ${req.method} ${req.path}`,
  })
}

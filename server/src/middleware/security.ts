import type { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'

/**
 * Attach a unique request ID to every incoming request.
 * Useful for tracing logs across distributed services.
 */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = (req.headers['x-request-id'] as string) || randomUUID()
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

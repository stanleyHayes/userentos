import type { Request, Response, NextFunction } from 'express'
import { logger } from '../utils/logger.js'

/**
 * Wraps an async route handler so that rejected promises are forwarded to
 * Express error-handling middleware instead of becoming unhandled rejections.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

/**
 * Global Express error handler.
 * Must be registered AFTER all routes.
 */
export function errorHandler(
  err: Error & { code?: number; keyValue?: Record<string, unknown> },
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  // Mongoose ValidationError
  if (err.name === 'ValidationError') {
    const messages = Object.values((err as { errors?: Record<string, { message: string }> }).errors ?? {})
      .map((e) => e.message)
      .join(', ')
    logger.warn(`Validation error: ${messages}`)
    res.status(400).json({ success: false, error: messages || err.message })
    return
  }

  // Mongoose CastError (e.g. invalid ObjectId)
  if (err.name === 'CastError') {
    const castErr = err as { kind?: string; value?: string; path?: string }
    logger.warn(`Cast error: invalid ${castErr.kind} for value "${castErr.value}"`)
    res.status(400).json({ success: false, error: `Invalid ${castErr.path}: ${castErr.value}` })
    return
  }

  // MongoDB duplicate key error (code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue ?? {})[0] || 'field'
    logger.warn(`Duplicate key error on field: ${field}`)
    res.status(409).json({ success: false, error: `Duplicate value for ${field}` })
    return
  }

  // Default: unexpected server error
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack })
  res.status(500).json({ success: false, error: 'Internal server error' })
}

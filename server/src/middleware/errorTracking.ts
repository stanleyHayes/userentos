import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
 
import type { Request, Response, NextFunction } from 'express'
import * as Sentry from '@sentry/node'
import { logger } from '../utils/logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// server/logs/errors.json (JSONL — one JSON object per line)
const LOG_DIR = path.resolve(__dirname, '..', '..', 'logs')
const LOG_FILE = path.join(LOG_DIR, 'errors.json')

let dirEnsured = false
function ensureLogDir() {
  if (dirEnsured) return
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    dirEnsured = true
  } catch (err) {
    logger.warn(`[errorTracking] could not create log dir: ${(err as Error).message}`)
  }
}

function sanitizeStack(stack: string | undefined): string {
  if (!stack) return ''
  // Strip absolute filesystem prefixes for portability and to avoid leaking path info
  const projectRoot = path.resolve(__dirname, '..', '..', '..')
  return stack
    .split('\n')
    .map((line) => line.replace(projectRoot, '<root>'))
    .join('\n')
}

export interface ErrorLogEntry {
  timestamp: string
  method: string
  path: string
  statusCode: number
  errorMessage: string
  stack: string
  userId?: string
}

/**
 * Append-only JSONL writer for error events. Best-effort — never throws.
 */
export function appendErrorLog(entry: ErrorLogEntry): void {
  ensureLogDir()
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', { encoding: 'utf8' })
  } catch (err) {
    logger.warn(`[errorTracking] could not append error log: ${(err as Error).message}`)
  }
}

/**
 * Read up to `limit` lines from the tail of errors.json. Returns parsed JSON
 * objects, newest first. Malformed lines are skipped.
 */
export function readRecentErrors(limit = 100): ErrorLogEntry[] {
  ensureLogDir()
  try {
    if (!fs.existsSync(LOG_FILE)) return []
    const raw = fs.readFileSync(LOG_FILE, 'utf8')
    const lines = raw.split('\n').filter((l) => l.trim().length > 0)
    const tail = lines.slice(-Math.max(0, limit))
    const out: ErrorLogEntry[] = []
    for (const line of tail) {
      try {
        out.push(JSON.parse(line) as ErrorLogEntry)
      } catch {
        // skip malformed
      }
    }
    return out.reverse() // newest first
  } catch (err) {
    logger.warn(`[errorTracking] could not read error log: ${(err as Error).message}`)
    return []
  }
}

/**
 * Augmented Express error handler — keeps the original response behavior of
 * `errorHandler`, but additionally writes a sanitized record to errors.json.
 */
export function errorTrackingHandler(
  err: Error & { code?: number; keyValue?: Record<string, unknown>; status?: number },
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Decide what status code we'll respond with (mirrors errorHandler logic)
  let statusCode = 500
  if (err.name === 'ValidationError') statusCode = 400
  else if (err.name === 'CastError') statusCode = 400
  else if (err.code === 11000) statusCode = 409
  else if (typeof err.status === 'number') statusCode = err.status

  const userId = (req as unknown as { user?: { userId?: string } }).user?.userId
  const entry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.originalUrl,
    statusCode,
    errorMessage: err.message ?? 'Unknown error',
    stack: sanitizeStack(err.stack),
    userId,
  }

  appendErrorLog(entry)

  // Attach user/request context to the current request scope so Sentry's
  // downstream setupExpressErrorHandler() includes it. Don't capture here —
  // Sentry's handler captures from next(err) and would otherwise double-report.
  if (statusCode >= 500) {
    const scope = Sentry.getCurrentScope()
    if (userId) scope.setUser({ id: userId })
    scope.setTag('http.method', req.method)
    scope.setTag('http.status', String(statusCode))
    scope.setContext('request', { method: req.method, path: req.originalUrl })
  }

  // Continue to the original error handler
  next(err)
}

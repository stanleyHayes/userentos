import type { Request, Response, NextFunction } from 'express'

/**
 * Dependency-free NoSQL injection guard (express-mongo-sanitize is not
 * installed and has Express 5 friction). Recursively removes object keys that
 * start with '$' or contain '.' from req.body and req.query, so payloads like
 * { "email": { "$gt": "" } } can never reach a Mongoose query.
 *
 * NOTE: this middleware mounts before route matching, so req.params is always
 * {} here — the params scrub below is defensive-only. Real route-param safety
 * comes from route-level validation (zod schemas, utils/params.ts).
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Returns a scrubbed copy; dangerous keys are dropped at every depth. */
export function scrubKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => scrubKeys(item)) as T
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      if (key.startsWith('$') || key.includes('.')) continue
      out[key] = scrubKeys(val)
    }
    return out as T
  }
  return value
}

export function sanitizeRequest(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') {
    req.body = scrubKeys(req.body)
  }
  if (req.params && typeof req.params === 'object') {
    req.params = scrubKeys(req.params) as Request['params']
  }
  // Express 5 defines req.query as a prototype getter — assigning throws.
  // Shadow it on the instance with the scrubbed value instead.
  const scrubbedQuery = scrubKeys(req.query)
  Object.defineProperty(req, 'query', {
    value: scrubbedQuery,
    writable: true,
    configurable: true,
  })
  next()
}

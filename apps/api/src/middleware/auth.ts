import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config/index.js'
import { error } from '../utils/response.js'

export interface AuthPayload {
  userId: string
  email: string
  roles: string[]
  permissions: string[]
  activeRole?: string
  /**
   * Token purpose. Session tokens ('session') authenticate normal requests.
   * Other purposes ('mfa', 'reset', 'download') are single-flow tokens that must
   * NEVER authenticate a general request — see authenticateDownload and the
   * auth routes that verify those purposes explicitly.
   */
  purpose?: string
}

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload
    }
  }
}

export function isSuperAdmin(req: Request): boolean {
  return req.user?.roles.includes('super_admin') === true
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    error(res, 'Authentication required', 401)
    return
  }

  try {
    const token = header.slice(7)
    const payload = jwt.verify(token, config.jwtSecret) as AuthPayload
    // Only session tokens authenticate requests. Pre-MFA, password-reset and
    // download tokens are signed with the same secret but must not work here.
    if (payload.purpose !== 'session') {
      error(res, 'Invalid or expired token', 401)
      return
    }
    // Ensure permissions array exists (for tokens issued before this feature)
    if (!payload.permissions) payload.permissions = []
    req.user = payload
    next()
  } catch {
    error(res, 'Invalid or expired token', 401)
  }
}

// Optional auth — sets req.user if token present, but doesn't reject
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    try {
      const token = header.slice(7)
      const payload = jwt.verify(token, config.jwtSecret) as AuthPayload
      if (payload.purpose === 'session') {
        if (!payload.permissions) payload.permissions = []
        req.user = payload
      }
    } catch { /* ignore invalid optional auth tokens */ }
  }
  next()
}

/**
 * Download-only auth for file downloads opened via browser links (PDFs).
 * Accepts a short-lived 'download'-purpose token via Bearer header or ?token=
 * query param. Session tokens are deliberately NOT accepted here, so a leaked
 * download URL never yields account access.
 */
export function authenticateDownload(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined
  const query = typeof req.query.token === 'string' ? req.query.token : undefined
  const token = bearer ?? query
  if (!token) {
    error(res, 'Authentication required', 401)
    return
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthPayload
    if (payload.purpose !== 'download') {
      error(res, 'Invalid or expired download token', 401)
      return
    }
    if (!payload.permissions) payload.permissions = []
    req.user = payload
    next()
  } catch {
    error(res, 'Invalid or expired download token', 401)
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      error(res, 'Authentication required', 401)
      return
    }
    // Super admin bypasses all role checks
    if (isSuperAdmin(req)) {
      next()
      return
    }
    const hasRole = req.user.roles.some((r) => roles.includes(r))
    if (!hasRole) {
      error(res, 'Insufficient permissions', 403)
      return
    }
    next()
  }
}

export function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      error(res, 'Authentication required', 401)
      return
    }
    // Super admin bypasses all permission checks
    if (isSuperAdmin(req)) {
      next()
      return
    }
    const hasAll = permissions.every((p) => req.user!.permissions.includes(p))
    if (!hasAll) {
      error(res, 'You do not have permission to perform this action', 403)
      return
    }
    next()
  }
}

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
      if (!payload.permissions) payload.permissions = []
      req.user = payload
    } catch { /* ignore invalid optional auth tokens */ }
  }
  next()
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

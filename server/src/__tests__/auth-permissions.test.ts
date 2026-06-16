import { describe, it, expect, vi } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { requireRole, requirePermission } from '../middleware/auth.js'

interface MockResponse {
  statusCode: number
  body: unknown
  status: (code: number) => MockResponse
  json: (body: unknown) => MockResponse
}

function makeRes(): MockResponse {
  const res: MockResponse = {
    statusCode: 0,
    body: undefined,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
  return res
}

function makeReq(opts: { roles?: string[]; permissions?: string[]; noUser?: boolean } = {}): Request {
  if (opts.noUser) return {} as Request
  return {
    user: {
      userId: 'u1',
      email: 'test@example.com',
      roles: opts.roles ?? [],
      permissions: opts.permissions ?? [],
    },
  } as unknown as Request
}

describe('requireRole', () => {
  it('returns 401 and does not call next when req.user is missing', () => {
    const req = makeReq({ noUser: true })
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    requireRole('admin')(req, res as unknown as Response, next)

    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 403 when user lacks the required role', () => {
    const req = makeReq({ roles: ['tenant'] })
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    requireRole('admin')(req, res as unknown as Response, next)

    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('calls next when user has the required role', () => {
    const req = makeReq({ roles: ['admin'] })
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    requireRole('admin')(req, res as unknown as Response, next)

    expect(next).toHaveBeenCalledOnce()
    expect(res.statusCode).toBe(0) // never set
  })

  it('calls next when user has any one of multiple required roles', () => {
    const req = makeReq({ roles: ['government'] })
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    requireRole('admin', 'government')(req, res as unknown as Response, next)

    expect(next).toHaveBeenCalledOnce()
  })

  it('super_admin always passes role checks even with mismatched required role', () => {
    const req = makeReq({ roles: ['super_admin'] })
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    requireRole('government')(req, res as unknown as Response, next)

    expect(next).toHaveBeenCalledOnce()
    expect(res.statusCode).toBe(0)
  })
})

describe('requirePermission', () => {
  it('returns 401 when req.user is missing', () => {
    const req = makeReq({ noUser: true })
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    requirePermission('users:edit')(req, res as unknown as Response, next)

    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 403 when user is missing one of multiple required permissions', () => {
    const req = makeReq({ permissions: ['users:edit'] })
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    requirePermission('users:edit', 'users:delete')(req, res as unknown as Response, next)

    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('calls next when user has all required permissions (with extras)', () => {
    const req = makeReq({ permissions: ['users:edit', 'extras'] })
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    requirePermission('users:edit')(req, res as unknown as Response, next)

    expect(next).toHaveBeenCalledOnce()
    expect(res.statusCode).toBe(0)
  })

  it('super_admin always passes permission checks even with no matching permissions', () => {
    const req = makeReq({ roles: ['super_admin'], permissions: [] })
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    requirePermission('users:edit', 'users:delete')(req, res as unknown as Response, next)

    expect(next).toHaveBeenCalledOnce()
    expect(res.statusCode).toBe(0)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'
import { User } from '../models/User.js'
import { authenticate, authenticateDownload, optionalAuth } from '../middleware/auth.js'
import { config } from '../config/index.js'

vi.mock('../models/User.js', () => ({ User: { exists: vi.fn() } }))
beforeEach(() => { vi.mocked(User.exists).mockResolvedValue({ _id: 'u1' } as never) })

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

function makeReq(token?: string, queryToken?: string): Request {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    query: queryToken ? { token: queryToken } : {},
  } as unknown as Request
}

function sign(payload: Record<string, unknown>): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: 300 })
}

const sessionPayload = {
  userId: 'u1',
  email: 'test@example.com',
  roles: ['tenant'],
  permissions: [],
  purpose: 'session',
}

describe('authenticate — token purpose enforcement', () => {
  it('accepts a session-purpose token', async () => {
    const req = makeReq(sign(sessionPayload))
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    await authenticate(req, res as unknown as Response, next)

    expect(next).toHaveBeenCalledOnce()
    expect((req as unknown as { user: { userId: string } }).user.userId).toBe('u1')
  })

  it('rejects a pre-MFA token (MFA-bypass regression)', async () => {
    const req = makeReq(sign({ userId: 'u1', purpose: 'mfa' }))
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    await authenticate(req, res as unknown as Response, next)

    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects a password-reset token', async () => {
    const req = makeReq(sign({ userId: 'u1', purpose: 'reset' }))
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    await authenticate(req, res as unknown as Response, next)

    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects a download-purpose token on general routes', async () => {
    const req = makeReq(sign({ userId: 'u1', purpose: 'download' }))
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    await authenticate(req, res as unknown as Response, next)

    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects legacy tokens with no purpose claim', async () => {
    const req = makeReq(sign({ userId: 'u1', roles: ['tenant'] }))
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    await authenticate(req, res as unknown as Response, next)

    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })
})

describe('authenticateDownload', () => {
  it('accepts a download-purpose token via query param', async () => {
    const req = makeReq(undefined, sign({ userId: 'u1', purpose: 'download' }))
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    await authenticateDownload(req, res as unknown as Response, next)

    expect(next).toHaveBeenCalledOnce()
  })

  it('rejects a full session token — a leaked download URL must not grant account access', async () => {
    const req = makeReq(undefined, sign(sessionPayload))
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    await authenticateDownload(req, res as unknown as Response, next)

    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects when no token is supplied', async () => {
    const req = makeReq()
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    await authenticateDownload(req, res as unknown as Response, next)

    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })
})


describe('deleted-account session invalidation', () => {
  it.each(['session', 'download'])('rejects an existing %s token after account deletion', async purpose => {
    vi.mocked(User.exists).mockResolvedValue(null)
    const req = makeReq(sign({ ...sessionPayload, purpose }))
    const res = makeRes()
    const next = vi.fn()
    await (purpose === 'session' ? authenticate : authenticateDownload)(req, res as unknown as Response, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })
  it('does not expose draft/private data through optional auth for a deleted account', async () => {
    vi.mocked(User.exists).mockResolvedValue(null)
    const req = makeReq(sign(sessionPayload))
    const next = vi.fn()
    await optionalAuth(req, makeRes() as unknown as Response, next)
    expect(req.user).toBeUndefined()
    expect(next).toHaveBeenCalledOnce()
  })
})

describe('suspended-account access boundaries', () => {
  beforeEach(() => {
    vi.mocked(User.exists).mockImplementation(((filter: Record<string, unknown>) => Promise.resolve('suspendedAt' in filter ? null : { _id: 'u1' })) as never)
  })
  it.each([
    ['GET', '/api/users/me'], ['GET', '/api/users/me/export?format=json'], ['DELETE', '/api/users/me/'],
    ['GET', '/api/agreements'], ['GET', '/api/payments?status=completed'], ['GET', '/api/payments/methods'],
    ['GET', '/api/agreements/507f1f77bcf86cd799439011'], ['GET', '/api/payments/507f1f77bcf86cd799439011'],
    ['POST', '/api/agreements/507f1f77bcf86cd799439011/document-link'], ['POST', '/api/payments'],
    ['POST', '/api/auth/change-password'], ['POST', '/api/auth/logout-all'],
  ])('preserves %s %s', async (method, url) => {
    const req = makeReq(sign(sessionPayload)); req.method = method; req.originalUrl = url
    const next = vi.fn()
    await authenticate(req, makeRes() as unknown as Response, next)
    expect(next).toHaveBeenCalledOnce()
  })
  it.each([
    ['PATCH', '/api/users/me'], ['POST', '/api/chat/conversations'], ['GET', '/api/admin/users'],
    ['GET', '/api/users/me/export/extra'], ['GET', '/api/agreements/tenants'],
    ['POST', '/api/agreements'], ['PATCH', '/api/agreements/507f1f77bcf86cd799439011'],
    ['POST', '/api/agreements/507f1f77bcf86cd799439011/sign'], ['GET', '/api/agreements/507f1f77bcf86cd799439011/extra'],
  ])('blocks %s %s with an appeal and privacy explanation', async (method, url) => {
    const req = makeReq(sign(sessionPayload)); req.method = method; req.originalUrl = url
    const next = vi.fn(); const res = makeRes()
    await authenticate(req, res as unknown as Response, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
    expect(JSON.stringify(res.body)).toContain('suspended')
  })
  it('derives restricted access from current account status, not token claims', async () => {
    const req = makeReq(sign({ ...sessionPayload, suspended: false }))
    req.method = 'GET'; req.originalUrl = '/api/agreements'
    const next = vi.fn()
    await authenticate(req, makeRes() as unknown as Response, next)
    expect(next).toHaveBeenCalledOnce()
    expect(req.user?.suspended).toBe(true)
  })
  it('permits a download-purpose token for a tenancy PDF, subject to controller ownership', async () => {
    const req = makeReq(undefined, sign({ ...sessionPayload, purpose: 'download' }))
    req.method = 'GET'; req.originalUrl = '/api/agreements/507f1f77bcf86cd799439011/document.pdf?token=redacted'
    const next = vi.fn()
    await authenticateDownload(req, makeRes() as unknown as Response, next)
    expect(next).toHaveBeenCalledOnce()
    expect(req.user?.suspended).toBe(true)
  })
  it('does not grant optional-auth privileges or unrelated download access', async () => {
    const req = makeReq(sign(sessionPayload))
    await optionalAuth(req, makeRes() as unknown as Response, vi.fn())
    expect(req.user).toBeUndefined()
    const res = makeRes(); const next = vi.fn()
    await authenticateDownload(makeReq(sign({ ...sessionPayload, purpose: 'download' })), res as unknown as Response, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })
})

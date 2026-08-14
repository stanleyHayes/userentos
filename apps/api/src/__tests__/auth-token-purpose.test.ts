import { describe, it, expect, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'
import { authenticate, authenticateDownload } from '../middleware/auth.js'
import { config } from '../config/index.js'

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
  it('accepts a session-purpose token', () => {
    const req = makeReq(sign(sessionPayload))
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    authenticate(req, res as unknown as Response, next)

    expect(next).toHaveBeenCalledOnce()
    expect((req as unknown as { user: { userId: string } }).user.userId).toBe('u1')
  })

  it('rejects a pre-MFA token (MFA-bypass regression)', () => {
    const req = makeReq(sign({ userId: 'u1', purpose: 'mfa' }))
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    authenticate(req, res as unknown as Response, next)

    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects a password-reset token', () => {
    const req = makeReq(sign({ userId: 'u1', purpose: 'reset' }))
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    authenticate(req, res as unknown as Response, next)

    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects a download-purpose token on general routes', () => {
    const req = makeReq(sign({ userId: 'u1', purpose: 'download' }))
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    authenticate(req, res as unknown as Response, next)

    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects legacy tokens with no purpose claim', () => {
    const req = makeReq(sign({ userId: 'u1', roles: ['tenant'] }))
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    authenticate(req, res as unknown as Response, next)

    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })
})

describe('authenticateDownload', () => {
  it('accepts a download-purpose token via query param', () => {
    const req = makeReq(undefined, sign({ userId: 'u1', purpose: 'download' }))
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    authenticateDownload(req, res as unknown as Response, next)

    expect(next).toHaveBeenCalledOnce()
  })

  it('rejects a full session token — a leaked download URL must not grant account access', () => {
    const req = makeReq(undefined, sign(sessionPayload))
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    authenticateDownload(req, res as unknown as Response, next)

    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects when no token is supplied', () => {
    const req = makeReq()
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction

    authenticateDownload(req, res as unknown as Response, next)

    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })
})

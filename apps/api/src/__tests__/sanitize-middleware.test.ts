import { describe, it, expect, vi } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { scrubKeys, sanitizeRequest } from '../middleware/sanitize.js'

describe('scrubKeys', () => {
  it('removes keys starting with $ from query operator payloads', () => {
    expect(scrubKeys({ email: { $gt: '' } })).toEqual({ email: {} })
  })

  it('removes keys containing dots', () => {
    expect(scrubKeys({ 'profile.role': 'admin', name: 'Ama' })).toEqual({ name: 'Ama' })
  })

  it('recurses into nested objects and arrays', () => {
    const input = {
      filter: { $where: 'sleep(1)', ok: 1 },
      list: [{ $ne: null }, { safe: true }, 'plain'],
    }
    expect(scrubKeys(input)).toEqual({
      filter: { ok: 1 },
      list: [{}, { safe: true }, 'plain'],
    })
  })

  it('leaves primitives and clean objects untouched', () => {
    expect(scrubKeys('hello')).toBe('hello')
    expect(scrubKeys(42)).toBe(42)
    expect(scrubKeys(null)).toBe(null)
    expect(scrubKeys({ a: 1, b: { c: [1, 2] } })).toEqual({ a: 1, b: { c: [1, 2] } })
  })
})

describe('sanitizeRequest middleware', () => {
  function makeRes(): Response {
    return {} as Response
  }

  it('scrubs req.body and calls next', () => {
    const req = {
      body: { email: { $gt: '' }, name: 'Ama' },
      params: {},
      query: {},
    } as unknown as Request
    const next = vi.fn() as unknown as NextFunction

    sanitizeRequest(req, makeRes(), next)

    expect(req.body).toEqual({ email: {}, name: 'Ama' })
    expect(next).toHaveBeenCalledOnce()
  })

  it('shadows the Express 5 req.query getter with a scrubbed copy', () => {
    const req = { body: {}, params: {} } as Record<string, unknown>
    // Simulate Express 5's prototype getter for req.query
    Object.defineProperty(req, 'query', {
      get: () => ({ role: { $in: ['admin'] }, page: '2' }),
      configurable: true,
    })

    const next = vi.fn() as unknown as NextFunction
    sanitizeRequest(req as unknown as Request, makeRes(), next)

    expect((req as unknown as Request).query).toEqual({ role: {}, page: '2' })
    expect(next).toHaveBeenCalledOnce()
  })

  it('params scrub is defensive-only — req.params is {} before route matching', () => {
    // sanitizeRequest mounts before the router, so Express has not populated
    // req.params yet; in production this scrubs an empty object. Param safety
    // is enforced at the route layer, not here.
    const req = {
      body: {},
      params: {},
      query: {},
    } as unknown as Request
    const next = vi.fn() as unknown as NextFunction

    sanitizeRequest(req, makeRes(), next)

    expect(req.params).toEqual({})
    expect(next).toHaveBeenCalledOnce()
  })
})

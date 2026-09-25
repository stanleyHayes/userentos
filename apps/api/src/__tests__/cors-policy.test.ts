import http from 'node:http'
import express from 'express'
import cors from 'cors'
import { describe, expect, it, vi } from 'vitest'
import { createCorsOrigin } from '../middleware/corsPolicy.js'
import { errorHandler } from '../middleware/errorHandler.js'

function check(options: Parameters<typeof createCorsOrigin>[0], origin: string | undefined) {
  return new Promise<boolean | undefined>(resolve => createCorsOrigin(options)(origin, (_err, allow) => resolve(allow as boolean | undefined)))
}

describe('CORS origin policy', () => {
  const allowed = ['https://userentos.com', 'https://*.userentos.com']

  it('allows configured origins and single-label platform subdomains', async () => {
    expect(await check({ allowed, permissive: false }, 'https://userentos.com')).toBe(true)
    expect(await check({ allowed, permissive: false }, 'https://demo-agency.userentos.com')).toBe(true)
    expect(await check({ allowed, permissive: false }, undefined)).toBe(true)
  })

  it('names no origin, rather than erroring, for anything else', async () => {
    for (const origin of ['https://evil.example', 'https://userentos.com.evil.example', 'https://a.b.userentos.com', 'http://demo.userentos.com', 'null']) {
      expect(await check({ allowed, permissive: false }, origin), origin).toBe(false)
    }
  })

  it('admits verified storefront custom domains over https only, caching the lookup', async () => {
    const lookup = vi.fn(async (host: string) => host === 'shop.example.com')
    const origin = createCorsOrigin({ allowed, permissive: false, isStorefrontDomain: lookup })
    const ask = (o: string) => new Promise(resolve => origin(o, (_e, allow) => resolve(allow)))
    expect(await ask('https://shop.example.com')).toBe(true)
    expect(await ask('https://shop.example.com')).toBe(true)
    expect(await ask('http://shop.example.com')).toBe(false)
    expect(await ask('https://other.example.com')).toBe(false)
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it('lets a disallowed-origin request reach normal handling instead of a 500', async () => {
    const app = express()
    app.use(cors({ origin: createCorsOrigin({ allowed, permissive: false }), credentials: true }))
    app.use(express.json())
    app.post('/echo', (_req, res) => { res.json({ ok: true }) })
    app.use(errorHandler)
    const server = http.createServer(app)
    await new Promise<void>(resolve => server.listen(0, resolve))
    try {
      const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
      const evil = await fetch(`${base}/echo`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' })
      expect(evil.status).toBe(200)
      expect(evil.headers.get('access-control-allow-origin')).toBeNull()
      const malformed = await fetch(`${base}/echo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' })
      expect(malformed.status).toBe(400)
      expect(await malformed.json()).toEqual({ success: false, error: 'Malformed JSON body' })
    } finally {
      await new Promise(resolve => server.close(resolve))
    }
  })
})

describe('cast errors', () => {
  it('do not echo the raw input or internal field names', async () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    const err = Object.assign(new Error('Cast to ObjectId failed'), { name: 'CastError', kind: 'ObjectId', value: 'not-an-id', path: '_id' })
    errorHandler(err, {} as never, res as never, (() => {}) as never)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Invalid id' })
  })
})

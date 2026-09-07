import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { storefrontHost } from '../middleware/storefrontHost.js'
import { resolveStorefrontByHost } from '../services/storefront.js'
import { Storefront } from '../models/Storefront.js'

vi.mock('../services/storefront.js', () => ({ resolveStorefrontByHost: vi.fn() }))
vi.mock('../models/Storefront.js', () => ({ Storefront: { findOne: vi.fn() } }))

/** Stand in for the chained `.select(...).lean()` a Mongoose query exposes. */
function storefrontDoc(doc: { canonicalDomain?: string } | null) {
  vi.mocked(Storefront.findOne).mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(doc) }),
  } as never)
}

function run(host?: string, opts: { method?: string; url?: string; proto?: string } = {}) {
  const headers: Record<string, string> = {}
  if (host) headers.host = host
  if (opts.proto) headers['x-forwarded-proto'] = opts.proto

  const req = {
    headers,
    method: opts.method ?? 'GET',
    originalUrl: opts.url ?? '/',
    protocol: 'https',
  } as unknown as Request

  const redirect = vi.fn()
  const res = { redirect } as unknown as Response
  const next = vi.fn() as unknown as NextFunction

  return storefrontHost(req, res, next).then(() => ({ req, next, redirect }))
}

describe('storefront host routing (spec §4.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storefrontDoc(null)
  })

  it('resolves a tenant subdomain to its storefront', async () => {
    vi.mocked(resolveStorefrontByHost).mockResolvedValue({ slug: 'homes-by-ama' })

    const { req, next } = await run('homes-by-ama.userentos.com')

    expect(req.storefrontSlug).toBe('homes-by-ama')
    expect(next).toHaveBeenCalled()
  })

  it('resolves a verified custom domain', async () => {
    vi.mocked(resolveStorefrontByHost).mockResolvedValue({ slug: 'homes-by-ama' })
    const { req } = await run('homesbyama.com')
    expect(req.storefrontSlug).toBe('homes-by-ama')
  })

  it('treats the platform hosts as never being a tenant', async () => {
    for (const host of ['userentos.com', 'www.userentos.com', 'api.userentos.com', 'localhost:5280', '127.0.0.1:3280']) {
      const { req } = await run(host)
      expect(req.storefrontSlug, `${host} must not resolve to a tenant`).toBeUndefined()
    }
    // The platform hosts short-circuit before any lookup.
    expect(resolveStorefrontByHost).not.toHaveBeenCalled()
  })

  it('falls through when the host matches no storefront', async () => {
    vi.mocked(resolveStorefrontByHost).mockResolvedValue(null)
    const { req, next } = await run('unknown.example.com')
    expect(req.storefrontSlug).toBeUndefined()
    expect(next).toHaveBeenCalled()
  })

  it('never breaks a request when resolution throws', async () => {
    vi.mocked(resolveStorefrontByHost).mockRejectedValue(new Error('db down'))
    const { req, next } = await run('homesbyama.com')
    expect(req.storefrontSlug).toBeUndefined()
    expect(next).toHaveBeenCalled()
  })

  it('ignores the port when matching', async () => {
    vi.mocked(resolveStorefrontByHost).mockResolvedValue({ slug: 'x' })
    await run('homesbyama.com:8443')
    expect(resolveStorefrontByHost).toHaveBeenCalledWith('homesbyama.com')
  })
})

describe('canonical domain enforcement (spec §4.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveStorefrontByHost).mockResolvedValue({ slug: 'homes-by-ama' })
  })

  it('301s a non-canonical host to the canonical one, preserving the path', async () => {
    storefrontDoc({ canonicalDomain: 'homesbyama.com' })

    const { redirect, next } = await run('homes-by-ama.userentos.com', { url: '/listings?page=2' })

    expect(redirect).toHaveBeenCalledWith(301, 'https://homesbyama.com/listings?page=2')
    // The request must stop here — continuing would also render the page.
    expect(next).not.toHaveBeenCalled()
  })

  it('serves the canonical host itself without redirecting', async () => {
    storefrontDoc({ canonicalDomain: 'homesbyama.com' })

    const { redirect, next, req } = await run('homesbyama.com')

    expect(redirect).not.toHaveBeenCalled()
    expect(req.storefrontSlug).toBe('homes-by-ama')
    expect(next).toHaveBeenCalled()
  })

  it('does not redirect when no canonical domain is set', async () => {
    storefrontDoc({})
    const { redirect, next } = await run('homes-by-ama.userentos.com')
    expect(redirect).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
  })

  it('honours the forwarded protocol behind a proxy', async () => {
    storefrontDoc({ canonicalDomain: 'homesbyama.com' })
    const { redirect } = await run('homes-by-ama.userentos.com', { proto: 'http' })
    expect(redirect).toHaveBeenCalledWith(301, 'http://homesbyama.com/')
  })

  it('leaves non-GET requests alone so a POST body is never dropped', async () => {
    storefrontDoc({ canonicalDomain: 'homesbyama.com' })

    const { redirect, next, req } = await run('homes-by-ama.userentos.com', { method: 'POST' })

    expect(redirect).not.toHaveBeenCalled()
    expect(req.storefrontSlug).toBe('homes-by-ama')
    expect(next).toHaveBeenCalled()
  })

  it('redirects HEAD as well as GET', async () => {
    storefrontDoc({ canonicalDomain: 'homesbyama.com' })
    const { redirect } = await run('homes-by-ama.userentos.com', { method: 'HEAD' })
    expect(redirect).toHaveBeenCalledWith(301, 'https://homesbyama.com/')
  })

  it('still serves the page when the canonical lookup fails', async () => {
    vi.mocked(Storefront.findOne).mockImplementation(() => { throw new Error('db down') })
    const { redirect, next } = await run('homes-by-ama.userentos.com')
    expect(redirect).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { storefrontHost } from '../middleware/storefrontHost.js'
import { resolveStorefrontByHost } from '../services/storefront.js'

vi.mock('../services/storefront.js', () => ({ resolveStorefrontByHost: vi.fn() }))

function run(host?: string) {
  const req = { headers: host ? { host } : {} } as unknown as Request
  const next = vi.fn() as unknown as NextFunction
  return storefrontHost(req, {} as Response, next).then(() => ({ req, next }))
}

describe('storefront host routing (spec §4.1)', () => {
  beforeEach(() => vi.clearAllMocks())

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

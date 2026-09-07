import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { config } from '../config/index.js'
import { Storefront } from '../models/Storefront.js'
import { StorefrontDomain } from '../models/StorefrontDomain.js'
import { Property } from '../models/Property.js'
import {
  validateSlug, validateDomain, publicStorefrontScope, storefrontScope,
  RESERVED_SLUGS, checkDomainOwnership,
} from '../services/storefront.js'

vi.mock('../models/Storefront.js', () => ({
  Storefront: { findOne: vi.fn(), findById: vi.fn(), find: vi.fn(), create: vi.fn() },
}))
vi.mock('../models/StorefrontDomain.js', () => ({
  StorefrontDomain: { findOne: vi.fn(), find: vi.fn(), create: vi.fn() },
}))
vi.mock('../models/Property.js', () => ({ Property: { find: vi.fn(), countDocuments: vi.fn() } }))
vi.mock('../models/BlogPost.js', () => ({ BlogPost: { find: vi.fn() } }))
vi.mock('../utils/audit.js', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }))

const entitlements = vi.hoisted(() => ({ requireEntitlement: vi.fn() }))
vi.mock('../services/entitlements.js', async (orig) => {
  const actual = await orig() as Record<string, unknown>
  return { ...actual, requireEntitlement: entitlements.requireEntitlement }
})

const { default: storefrontRouter } = await import('../routes/storefronts.js')

const token = (roles: string[], userId = 'seller-a') =>
  jwt.sign({ userId, email: 's@rentos.test', roles, permissions: [], purpose: 'session' }, config.jwtSecret)
const auth = (roles: string[], userId = 'seller-a') =>
  ({ authorization: `Bearer ${token(roles, userId)}`, 'content-type': 'application/json' })

describe('storefront tenant isolation', () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use('/api/storefronts', storefrontRouter)
    await new Promise<void>((r) => { server = app.listen(0, () => r()) })
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/storefronts`
  })
  afterAll(async () => { await new Promise((r) => server.close(r)) })
  beforeEach(() => {
    vi.clearAllMocks()
    entitlements.requireEntitlement.mockResolvedValue(undefined)
  })

  // ── The isolation guarantee (spec §4.2, §18) ──

  it('scopes a storefront property query to its owner on the server', async () => {
    vi.mocked(Storefront.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'sf-a', slug: 'ama', ownerId: 'seller-a', status: 'active' }) } as never)
    const lean = vi.fn().mockResolvedValue([])
    vi.mocked(Property.find).mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => ({ lean }) }) }) } as never)
    vi.mocked(Property.countDocuments).mockResolvedValue(0 as never)

    const res = await fetch(`${baseUrl}/ama/properties`)
    expect(res.status).toBe(200)

    const filter = vi.mocked(Property.find).mock.calls[0][0] as unknown as Record<string, unknown>
    // Storefront A must query ONLY seller A's listings.
    expect(filter.landlordId).toBe('seller-a')
  })

  it('never lets one storefront scope resolve to another seller', () => {
    const a = publicStorefrontScope({ ownerId: 'seller-a' })
    const b = publicStorefrontScope({ ownerId: 'seller-b' })

    expect(a.landlordId).toBe('seller-a')
    expect(b.landlordId).toBe('seller-b')
    expect(a.landlordId).not.toBe(b.landlordId)
  })

  it('cannot have the owner scope overridden by caller-supplied filters', () => {
    // Even if a caller passes landlordId, the scope wins — the spread puts the
    // owner last on purpose.
    const scope = storefrontScope({ ownerId: 'seller-a' }, { landlordId: 'seller-b' } as Record<string, unknown>)
    expect(scope.landlordId).toBe('seller-a')
  })

  it('shows only publicly visible listings on a public storefront', () => {
    const scope = publicStorefrontScope({ ownerId: 'seller-a' })
    expect(scope.listingStatus).toEqual({ $in: ['approved', 'published'] })
  })

  // ── Slug policy (§4.1) ──

  it('refuses reserved slugs', () => {
    for (const reserved of ['www', 'admin', 'api', 'app', 'studio', 'auth', 'support', 'system']) {
      expect(RESERVED_SLUGS.has(reserved), `${reserved} must be reserved`).toBe(true)
      const result = validateSlug(reserved)
      expect(result.ok).toBe(false)
    }
  })

  it('accepts a sensible slug and rejects malformed ones', () => {
    expect(validateSlug('homes-by-ama').ok).toBe(true)
    expect(validateSlug('ab').ok).toBe(false)          // too short
    expect(validateSlug('-lead').ok).toBe(false)        // leading hyphen
    expect(validateSlug('trail-').ok).toBe(false)       // trailing hyphen
    expect(validateSlug('Has Spaces').ok).toBe(false)
    // Case is normalised rather than rejected — DNS is case-insensitive, so
    // "HomesByAma" should become homesbyama instead of erroring at the seller.
    expect(validateSlug('HomesByAma').ok).toBe(true)
  })

  // ── Entitlement gates (§7.3, §18) ──

  it('refuses storefront creation without the entitlement, with 402', async () => {
    const { EntitlementError } = await import('../services/entitlements.js')
    entitlements.requireEntitlement.mockRejectedValue(new EntitlementError('storefront.enabled', 'Your plan does not include a storefront.'))

    const res = await fetch(baseUrl, {
      method: 'POST', headers: auth(['landlord']),
      body: JSON.stringify({ slug: 'homes-by-ama', name: 'Homes by Ama' }),
    })

    expect(res.status).toBe(402)
    expect(Storefront.create).not.toHaveBeenCalled()
  })

  it('refuses a custom domain without the entitlement', async () => {
    const { EntitlementError } = await import('../services/entitlements.js')
    entitlements.requireEntitlement.mockRejectedValue(new EntitlementError('storefront.custom_domain', 'Your plan does not include a custom domain.'))

    const res = await fetch(`${baseUrl}/me/domains`, {
      method: 'POST', headers: auth(['landlord']),
      body: JSON.stringify({ domain: 'homesbyama.com' }),
    })

    expect(res.status).toBe(402)
    expect(StorefrontDomain.create).not.toHaveBeenCalled()
  })

  // ── Custom domain lifecycle (§4.3, §18) ──

  it('refuses to make an unverified domain canonical', async () => {
    vi.mocked(Storefront.findOne).mockResolvedValue({ _id: 'sf-a', ownerId: 'seller-a', save: vi.fn() } as never)
    vi.mocked(StorefrontDomain.findOne).mockResolvedValue({
      _id: 'dom-1', storefrontId: 'sf-a', domain: 'homesbyama.com', status: 'pending', save: vi.fn(),
    } as never)

    const res = await fetch(`${baseUrl}/me/domains/dom-1/canonical`, { method: 'POST', headers: auth(['landlord']) })
    expect(res.status).toBe(409)
  })

  it('rejects platform domains as custom domains', () => {
    expect(validateDomain('homesbyama.com').ok).toBe(true)
    expect(validateDomain('evil.userentos.com').ok).toBe(false)
    expect(validateDomain('not a domain').ok).toBe(false)
  })

  it('verifies ownership only when the exact TXT token is published', async () => {
    const token = 'rentos-verify=abc123'
    await expect(checkDomainOwnership('x.com', token, async () => [['rentos-verify=abc123']]))
      .resolves.toEqual({ verified: true })

    const wrong = await checkDomainOwnership('x.com', token, async () => [['rentos-verify=different']])
    expect(wrong.verified).toBe(false)

    const missing = await checkDomainOwnership('x.com', token, async () => { throw new Error('ENOTFOUND') })
    expect(missing.verified).toBe(false)
  })
})

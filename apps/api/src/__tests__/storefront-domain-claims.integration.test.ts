import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
vi.mock('../services/entitlements.js', async (orig) => ({
  ...(await orig() as Record<string, unknown>),
  requireEntitlement: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../services/storefront.js', async (orig) => ({
  ...(await orig() as Record<string, unknown>),
  // The squatter does not control the DNS.
  checkDomainOwnership: vi.fn().mockResolvedValue({ verified: false, reason: 'TXT record not found' }),
}))
vi.mock('../utils/audit.js', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }))
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { Storefront } from '../models/Storefront.js'
import { StorefrontDomain } from '../models/StorefrontDomain.js'
import router, { PENDING_CLAIM_TTL_MS } from '../routes/storefronts.js'

const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('custom domain claims', () => {
  const squatter = new mongoose.Types.ObjectId(), owner = new mongoose.Types.ObjectId()
  const tag = String(owner).slice(-8)
  const domains = [`homes-${tag}.com`, `lapsed-${tag}.com`]
  let server: Server, url: string
  const headers = (id: mongoose.Types.ObjectId) => ({
    Authorization: `Bearer ${jwt.sign({ userId: String(id), roles: ['landlord'], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`,
    'Content-Type': 'application/json',
  })
  const claim = (as: mongoose.Types.ObjectId, domain: string) =>
    fetch(`${url}/me/domains`, { method: 'POST', headers: headers(as), body: JSON.stringify({ domain }) })
  const age = (domain: string, ms: number) => StorefrontDomain.updateOne({ domain }, { $set: { claimedAt: new Date(Date.now() - ms) } })

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create([squatter, owner].map((_id, i) => ({
      _id, email: `domain-${i}-${_id}@rentos.test`, phone: '0241234567', firstName: 'Dom', lastName: 'Fixture',
      passwordHash: 'fixture-only', roles: ['landlord'], activeRole: 'landlord',
    })))
    await Storefront.collection.insertMany([squatter, owner].map((id, i) => ({ ownerType: 'user', ownerId: String(id), slug: `dom-${i}-${tag}`, name: `Dom ${i}`, status: 'active' })))
    const app = express(); app.use(express.json()); app.use('/', router)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    await StorefrontDomain.deleteMany({ domain: { $in: domains } })
    await Storefront.deleteMany({ ownerId: { $in: [String(squatter), String(owner)] } })
    await User.deleteMany({ _id: { $in: [squatter, owner] } })
    await mongoose.disconnect()
  })

  it('lets the real owner take over a claim nobody verified within 72 hours', async () => {
    const [domain] = domains
    expect((await claim(squatter, domain)).status).toBe(201)
    expect((await claim(owner, domain)).status).toBe(409)

    // Retrying verification does not keep the claim alive.
    await age(domain, PENDING_CLAIM_TTL_MS + 60_000)
    const row = await StorefrontDomain.findOne({ domain }).lean()
    expect((await fetch(`${url}/me/domains/${row!._id}/verify`, { method: 'POST', headers: headers(squatter) })).status).toBe(409)

    const takeover = await claim(owner, domain)
    expect(takeover.status).toBe(201)
    const after = await StorefrontDomain.findOne({ domain }).lean()
    const ownerFront = await Storefront.findOne({ ownerId: String(owner) }).lean()
    expect(after?.storefrontId).toBe(String(ownerFront!._id))
    expect(after?.verificationToken).not.toBe(row!.verificationToken)
    expect(after?.status).toBe('pending')
  })

  it('does not let a claimant renew their own lapsed claim straight away', async () => {
    const [, domain] = domains
    expect((await claim(squatter, domain)).status).toBe(201)
    await age(domain, PENDING_CLAIM_TTL_MS + 60_000)
    expect((await claim(squatter, domain)).status).toBe(409)
    // After the owner's window has also passed, anyone may claim it again.
    await age(domain, 2 * PENDING_CLAIM_TTL_MS + 60_000)
    expect((await claim(squatter, domain)).status).toBe(201)
  })
})

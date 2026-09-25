import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../services/notify.js', () => ({
  notify: vi.fn().mockResolvedValue(undefined),
  notifyAgreementSigned: vi.fn().mockResolvedValue(undefined),
  notifyAgreementFullySigned: vi.fn().mockResolvedValue(undefined),
  notifyDisputeFiled: vi.fn().mockResolvedValue(undefined),
  notifyDisputeUpdate: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../services/webhooks.js', () => ({ dispatchWebhook: vi.fn() }))

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { Property } = await import('../models/Property.js')
const { Agreement } = await import('../models/Agreement.js')
const { Dispute } = await import('../models/Dispute.js')
const { CreditScore } = await import('../models/CreditScore.js')
const { errorHandler } = await import('../middleware/errorHandler.js')
const { default: agreementsRouter } = await import('../routes/agreements.js')
const { default: creditRouter } = await import('../routes/credit.js')
const { default: disputesRouter } = await import('../routes/disputes.js')

const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'

describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('tenancy relationships require a tenant-signed lease', () => {
  const landlordId = String(new mongoose.Types.ObjectId())
  const victimId = String(new mongoose.Types.ObjectId())
  const adminLikeId = String(new mongoose.Types.ObjectId())
  let propertyId = ''
  let server: Server
  let base = ''
  const tokenFor = (userId: string, roles: string[]) => jwt.sign({ userId, email: `${userId}@rentos.test`, roles, permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })
  const asLandlord = { Authorization: `Bearer ${tokenFor(landlordId, ['landlord'])}`, 'Content-Type': 'application/json' }
  const asVictim = { Authorization: `Bearer ${tokenFor(victimId, ['tenant'])}`, 'Content-Type': 'application/json' }
  const call = async (path: string, headers: Record<string, string>, init: { method?: string; body?: unknown } = {}) => {
    const response = await fetch(`${base}${path}`, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) })
    return { status: response.status, body: await response.json() as { data?: unknown; error?: string } }
  }
  const lease = (overrides: Record<string, unknown> = {}) => ({
    propertyId, landlordId, tenantId: victimId, startDate: '2026-01-01', endDate: '2027-01-01', rentAmount: 1000, securityDeposit: 0, advanceMonths: 1, terms: [], specialConditions: [], ...overrides,
  })
  const disputeBody = () => ({ filedAgainst: victimId, propertyId, category: 'other', title: 'Fabricated', description: 'A dispute filed against someone who never rented here.' })

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create([
      { _id: landlordId, email: `landlord-${landlordId}@rentos.test`, phone: '0240000001', firstName: 'Lara', lastName: 'Landlord', passwordHash: 'fixture', roles: ['landlord'], activeRole: 'landlord' },
      { _id: victimId, email: `victim-${victimId}@rentos.test`, phone: '0240000002', firstName: 'Vic', lastName: 'Tim', passwordHash: 'fixture', roles: ['tenant'], activeRole: 'tenant' },
      { _id: adminLikeId, email: `staff-${adminLikeId}@rentos.test`, phone: '0240000003', firstName: 'Sam', lastName: 'Staff', passwordHash: 'fixture', roles: ['government'], activeRole: 'government' },
    ])
    const property = await Property.create({ landlordId, title: 'Relationship fixture', description: 'Fixture', type: 'apartment', address: { street: '1 Test St', city: 'Accra', region: 'Greater Accra' }, rentAmount: 1000, rentDurationMonths: 12, advanceMonths: 1 })
    propertyId = property._id.toString()
    const app = express()
    app.use(express.json())
    app.use('/agreements', agreementsRouter)
    app.use('/credit', creditRouter)
    app.use('/disputes', disputesRouter)
    app.use(errorHandler)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterEach(async () => {
    await Agreement.deleteMany({ propertyId })
    await Dispute.deleteMany({ propertyId })
    await Property.updateOne({ _id: propertyId }, { $set: { status: 'available' } })
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Promise.all([
      User.deleteMany({ _id: { $in: [landlordId, victimId, adminLikeId] } }),
      Property.deleteOne({ _id: propertyId }),
      CreditScore.deleteMany({ userId: { $in: [landlordId, victimId] } }),
    ])
    await mongoose.disconnect()
  })

  it('refuses to draft an agreement naming a non-tenant account', async () => {
    const created = await call('/agreements', asLandlord, { method: 'POST', body: lease({ tenantId: adminLikeId }) })
    expect(created.status).toBe(404)
    expect(await Agreement.countDocuments({ propertyId })).toBe(0)
  })

  it.each([
    ['a draft the landlord created', {}],
    ['a lease only the landlord signed', { status: 'pending_signatures', landlordSignature: '2026-01-01T00:00:00.000Z', landlordSignatureName: 'Lara Landlord' }],
    ['an "active" record without a tenant signature', { status: 'active', landlordSignature: '2026-01-01T00:00:00.000Z' }],
  ])('%s unlocks nothing about the named tenant', async (_label, overrides) => {
    if (Object.keys(overrides).length === 0) {
      expect((await call('/agreements', asLandlord, { method: 'POST', body: lease() })).status).toBe(201)
    } else {
      await Agreement.create(lease(overrides))
    }

    const list = await call('/agreements', asLandlord)
    const [item] = (list.body.data as { items: Record<string, unknown>[] }).items
    expect(item.tenantId).toBe(victimId)
    expect(item.tenantEmail).toBeUndefined()
    expect(item.tenantPhone).toBeUndefined()

    const tenants = await call('/agreements/tenants', asLandlord)
    expect((tenants.body.data as { items: unknown[] }).items).toEqual([])

    expect((await call(`/credit/${victimId}`, asLandlord)).status).toBe(403)

    const filed = await call('/disputes', asLandlord, { method: 'POST', body: disputeBody() })
    expect(filed.status).toBe(400)
    expect(await Dispute.countDocuments({ propertyId })).toBe(0)

    // The named tenant cannot weaponise a draft against the landlord either.
    const tenantFiled = await call('/disputes', asVictim, { method: 'POST', body: { ...disputeBody(), filedAgainst: landlordId } })
    expect(tenantFiled.status).toBe(403)
  })

  it('the tenant still sees their own contact details on a draft addressed to them', async () => {
    await Agreement.create(lease())
    const list = await call('/agreements', asVictim)
    const [item] = (list.body.data as { items: Record<string, unknown>[] }).items
    expect(item.tenantEmail).toBe(`victim-${victimId}@rentos.test`)
  })

  it.each(['active', 'expired', 'terminated'])('a tenant-signed %s lease establishes the relationship', async (status) => {
    await Agreement.create(lease({ status, landlordSignature: '2026-01-01T00:00:00.000Z', tenantSignature: '2026-01-02T00:00:00.000Z' }))

    const list = await call('/agreements', asLandlord)
    const [item] = (list.body.data as { items: Record<string, unknown>[] }).items
    expect(item.tenantEmail).toBe(`victim-${victimId}@rentos.test`)
    expect(item.tenantPhone).toBe('0240000002')

    const tenants = await call('/agreements/tenants', asLandlord)
    expect((tenants.body.data as { items: { id: string; email: string }[] }).items).toEqual([expect.objectContaining({ id: victimId, email: `victim-${victimId}@rentos.test` })])

    expect((await call(`/credit/${victimId}`, asLandlord)).status).toBe(200)
    expect((await call('/disputes', asLandlord, { method: 'POST', body: disputeBody() })).status).toBe(201)
  })
})

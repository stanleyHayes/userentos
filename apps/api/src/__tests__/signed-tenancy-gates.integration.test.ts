import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../services/notify.js', () => ({ notify: vi.fn().mockResolvedValue(true) }))

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { Property } = await import('../models/Property.js')
const { Agreement } = await import('../models/Agreement.js')
const { MaintenanceRequest } = await import('../models/MaintenanceRequest.js')
const { FinancingApplication } = await import('../models/FinancingApplication.js')
const { errorHandler } = await import('../middleware/errorHandler.js')
const { default: maintenanceRouter } = await import('../routes/maintenance.js')
const { default: capabilitiesRouter } = await import('../routes/capabilities.js')
const { default: passportRouter } = await import('../routes/tenantPassport.js')

const uri = testMongoUri

describe.skipIf(!hasTestMongo)('drafts naming a tenant are not tenancies', () => {
  const landlordId = String(new mongoose.Types.ObjectId())
  const tenantId = String(new mongoose.Types.ObjectId())
  const financierId = String(new mongoose.Types.ObjectId())
  let propertyId = ''
  let applicationId = ''
  let server: Server
  let base = ''
  const as = (userId: string, roles: string[]) => ({ Authorization: `Bearer ${jwt.sign({ userId, roles, permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`, 'Content-Type': 'application/json' })
  const asTenant = as(tenantId, ['tenant'])
  const call = async (path: string, headers: Record<string, string>, method = 'GET', body?: unknown) => {
    const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    const text = await response.text()
    return { status: response.status, text, data: (text.startsWith('{') ? JSON.parse(text).data : undefined) as Record<string, unknown> | undefined }
  }
  const lease = (overrides: Record<string, unknown> = {}) => Agreement.create({ propertyId, landlordId, tenantId, startDate: '2026-01-01', endDate: '2027-01-01', rentAmount: 800, ...overrides })
  const signed = { status: 'active', landlordSignature: '2026-01-01T00:00:00.000Z', tenantSignature: '2026-01-01T00:00:00.000Z' }
  const request = (extra: Record<string, unknown> = {}) => call('/maintenance', asTenant, 'POST', { propertyId, title: 'Leaking tap', description: 'Kitchen tap drips', ...extra })

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create([
      { _id: landlordId, email: `gate-landlord-${landlordId}@rentos.test`, phone: '0240008001', firstName: 'Gil', lastName: 'Landlord', passwordHash: 'fixture', roles: ['landlord'], activeRole: 'landlord' },
      { _id: tenantId, email: `gate-tenant-${tenantId}@rentos.test`, phone: '0240008002', firstName: 'Gia', lastName: 'Tenant', passwordHash: 'fixture', roles: ['tenant'], activeRole: 'tenant' },
      { _id: financierId, email: `gate-fin-${financierId}@rentos.test`, phone: '0240008003', firstName: 'Fin', lastName: 'Ancier', passwordHash: 'fixture', roles: ['financier'], activeRole: 'financier' },
    ])
    const property = await Property.create({ landlordId, title: 'Gate fixture', description: 'Fixture', type: 'apartment', address: { street: '2 Test St', city: 'Accra', region: 'Greater Accra' }, rentAmount: 800, rentDurationMonths: 12, advanceMonths: 1 })
    propertyId = property.id
    applicationId = (await FinancingApplication.create({ applicantId: tenantId, financierId, offerId: 'gate-offer', amountRequested: 500, tenureMonths: 6, purpose: 'Rent advance' })).id
    const app = express()
    app.use(express.json())
    app.use('/maintenance', maintenanceRouter)
    app.use('/capabilities', capabilitiesRouter)
    app.use('/tenant-passport', passportRouter)
    app.use(errorHandler)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterEach(async () => {
    await Promise.all([Agreement.deleteMany({ propertyId }), MaintenanceRequest.deleteMany({ propertyId })])
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Promise.all([
      User.deleteMany({ _id: { $in: [landlordId, tenantId, financierId] } }),
      Property.deleteOne({ _id: propertyId }),
      FinancingApplication.deleteOne({ _id: applicationId }),
    ])
    await mongoose.disconnect()
  })

  it('files maintenance requests only under a lease the tenant signed', async () => {
    await lease()
    await lease({ status: 'pending_signatures', landlordSignature: '2026-01-01T00:00:00.000Z' })
    expect((await request()).status).toBe(403)
    const live = await lease(signed)
    expect((await request({ agreementId: live.id })).status).toBe(201)
  })

  it('refuses an agreementId that is not the tenant\'s signed lease for the property', async () => {
    await lease(signed)
    const draft = await lease()
    const someoneElses = await lease({ ...signed, tenantId: landlordId })
    expect((await request({ agreementId: draft.id })).status).toBe(400)
    expect((await request({ agreementId: someoneElses.id })).status).toBe(400)
  })

  it('counts only signed tenancies in rental history, financing decisions and the tenant passport', async () => {
    await lease()
    await lease({ status: 'terminated' })
    await lease({ ...signed, status: 'terminated' })

    const csv = await call('/capabilities/tenant/rental-history.csv', asTenant)
    expect(csv.text.trim().split('\n')).toHaveLength(2) // header + the one signed lease

    const decision = await call(`/capabilities/financier/decision/${applicationId}`, as(financierId, ['financier']))
    expect(decision.data!.rentalHistory).toEqual({ agreements: 1, completed: 1 })

    const passport = await call('/tenant-passport/me', asTenant)
    expect((passport.data!.agreements as Record<string, unknown>)).toMatchObject({ active: 0, past: 1, total: 1 })
  })
})

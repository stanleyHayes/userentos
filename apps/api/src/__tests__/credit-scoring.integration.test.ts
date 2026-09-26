import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { Agreement } from '../models/Agreement.js'
import { Payment } from '../models/Payment.js'
import { SavingsPlan } from '../models/SavingsPlan.js'
import { Dispute } from '../models/Dispute.js'
import { Application } from '../models/Application.js'
import { CreditScore } from '../models/CreditScore.js'
import { AuditLog } from '../models/AuditLog.js'
import creditRouter from '../routes/credit.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

const uri = testMongoUri
type Factors = { paymentHistory: number; savingsConsistency: number; agreementCompliance: number; disputeRecord: number }

describe.skipIf(!hasTestMongo)('credit scoring and access', () => {
  const tenantId = String(new mongoose.Types.ObjectId())
  const landlordId = String(new mongoose.Types.ObjectId())
  const strangerId = String(new mongoose.Types.ObjectId())
  const govId = String(new mongoose.Types.ObjectId())
  const adminId = String(new mongoose.Types.ObjectId())
  const propertyId = String(new mongoose.Types.ObjectId())
  const tag = `credit-${tenantId}`
  let server: Server
  let base = ''
  const headers = (userId: string, roles: string[]) => ({ Authorization: `Bearer ${jwt.sign({ userId, roles, permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}` })
  const get = async (path: string, userId: string, roles: string[]) => {
    const response = await fetch(`${base}${path}`, { headers: headers(userId, roles) })
    return { status: response.status, body: await response.json() as { data?: { factors?: Factors } & Record<string, unknown> } }
  }
  let seq = 0
  const payment = (overrides: Record<string, unknown>) => ({ tenantId, amount: 500, method: 'mtn_momo', status: 'completed', reference: `${tag}-${seq++}`, ...overrides })
  const lease = (overrides: Record<string, unknown> = {}) => ({ propertyId, landlordId, tenantId, startDate: '2026-01-01', endDate: '2027-01-01', rentAmount: 500, advanceMonths: 1, terms: [], ...overrides })

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create([tenantId, landlordId, strangerId, govId, adminId].map((id, i) => ({
      _id: id, email: `${tag}-${i}@rentos.test`, phone: `02400000${i}`, firstName: 'Credit', lastName: `Fixture${i}`, passwordHash: 'fixture',
      roles: [['tenant'], ['landlord'], ['landlord'], ['government'], ['admin']][i], activeRole: ['tenant', 'landlord', 'landlord', 'government', 'admin'][i],
    })))
    const app = express()
    app.use(express.json())
    app.use('/credit', creditRouter)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await Promise.all([
      Agreement.deleteMany({ tenantId }), Payment.deleteMany({ tenantId }), SavingsPlan.deleteMany({ userId: tenantId }),
      Dispute.deleteMany({ filedAgainst: tenantId }), Application.deleteMany({ tenantId }), CreditScore.deleteMany({ userId: tenantId }),
      AuditLog.deleteMany({ entityId: tenantId }),
    ])
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await User.deleteMany({ _id: { $in: [tenantId, landlordId, strangerId, govId, adminId] } })
    await mongoose.disconnect()
  })

  it('ignores wallet top-ups, rent on unsigned drafts, token savings plans, draft flags and stranger disputes', async () => {
    const draft = await Agreement.create(lease({ advanceMonths: 12 }))
    expect(draft.complianceFlags.some((f) => f.type === 'violation')).toBe(true)
    await Payment.create([
      ...Array.from({ length: 5 }, () => payment({ purpose: 'wallet_deposit' })),
      ...Array.from({ length: 3 }, () => payment({ purpose: 'rent', agreementId: draft.id, landlordId })),
    ])
    await SavingsPlan.create([
      { userId: tenantId, targetAmount: 0.01, currentAmount: 1, frequency: 'daily', contributionAmount: 0.01, startDate: '2026-01-01', targetDate: '2026-01-02', status: 'completed' },
      { userId: tenantId, targetAmount: 0.01, currentAmount: 1, frequency: 'daily', contributionAmount: 0.01, startDate: '2026-01-01', targetDate: '2026-01-02', status: 'active' },
      { userId: tenantId, targetAmount: 0.5, currentAmount: 1, frequency: 'daily', contributionAmount: 0.01, startDate: '2026-01-01', targetDate: '2026-01-02', status: 'active' },
    ])
    await Dispute.create({ filedBy: strangerId, filedAgainst: tenantId, propertyId, category: 'other', title: 'Grief', description: 'Filed by someone with no lease.' })

    const { status, body } = await get('/credit/me', tenantId, ['tenant'])
    expect(status).toBe(200)
    expect(body.data?.factors).toMatchObject({ paymentHistory: 20, savingsConsistency: 0, agreementCompliance: 8, disputeRecord: 10 })
  })

  it('still scores real rent, meaningful savings and disputes from a signed counterparty', async () => {
    const signed = await Agreement.create(lease({ status: 'active', landlordSignature: '2026-01-01', tenantSignature: '2026-01-01' }))
    await Payment.create(Array.from({ length: 3 }, () => payment({ purpose: 'rent', agreementId: signed.id, landlordId })))
    await Payment.create(payment({ purpose: 'rent', agreementId: signed.id, landlordId, status: 'pending' }))
    await SavingsPlan.create({ userId: tenantId, targetAmount: 1000, currentAmount: 500, frequency: 'monthly', contributionAmount: 100, startDate: '2026-01-01', targetDate: '2026-12-01', status: 'active' })
    await Dispute.create({ filedBy: landlordId, filedAgainst: tenantId, propertyId, category: 'other', title: 'Real', description: 'Filed by the signed landlord.' })

    const { body } = await get('/credit/me', tenantId, ['tenant'])
    expect(body.data?.factors).toMatchObject({ paymentHistory: 35, savingsConsistency: 7, agreementCompliance: 20, disputeRecord: 6 })
  })

  it('gives government aggregates only, never an individual report', async () => {
    expect((await get(`/credit/${tenantId}`, govId, ['government'])).status).toBe(403)
    expect((await get(`/credit/${tenantId}`, govId, ['legal_officer'])).status).toBe(403)
    await get('/credit/me', tenantId, ['tenant'])
    const aggregate = await get('/credit/aggregate', govId, ['government'])
    expect(aggregate.status).toBe(200)
    expect(aggregate.body.data).toMatchObject({ count: expect.any(Number), bands: expect.any(Object) })
    expect(aggregate.body.data).not.toHaveProperty('userId')
    expect((await get('/credit/aggregate', tenantId, ['tenant'])).status).toBe(403)
  })

  it('audits every admin lookup and refuses the lookup when the audit cannot be written', async () => {
    const ok = await get(`/credit/${tenantId}?reason=chargeback%20review`, adminId, ['admin'])
    expect(ok.status).toBe(200)
    const audit = await AuditLog.findOne({ entityId: tenantId, action: 'credit.score.view' }).lean()
    expect(audit).toMatchObject({ userId: adminId, entityType: 'CreditScore' })
    expect(JSON.parse(audit!.details!)).toEqual({ reason: 'chargeback review' })

    await CreditScore.deleteMany({ userId: tenantId })
    vi.spyOn(AuditLog, 'create').mockRejectedValueOnce(new Error('audit store down'))
    expect((await get(`/credit/${tenantId}`, adminId, ['admin'])).status).toBe(503)
    expect(await CreditScore.exists({ userId: tenantId })).toBeNull()
  })

  it('lets a landlord screen a live applicant but not a withdrawn one', async () => {
    const application = await Application.create({ tenantId, propertyId, landlordId, status: 'withdrawn', moveInDate: new Date('2026-02-01'), duration: 12 })
    expect((await get(`/credit/${tenantId}`, landlordId, ['landlord'])).status).toBe(403)
    await Application.updateOne({ _id: application._id }, { $set: { status: 'pending' } })
    expect((await get(`/credit/${tenantId}`, landlordId, ['landlord'])).status).toBe(200)
  })
})

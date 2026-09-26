import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { InsuranceProviderProfile } from '../models/InsuranceProviderProfile.js'
import { InsuranceProduct } from '../models/InsuranceProduct.js'
import { InsurancePolicy } from '../models/InsurancePolicy.js'
import { Wallet } from '../models/Wallet.js'
import { errorHandler } from '../middleware/errorHandler.js'
import insuranceRouter from '../routes/insurance.js'
import providerRouter from '../routes/insuranceProviders.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../services/notify.js', () => ({ notify: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../utils/audit.js', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }))

const uri = testMongoUri
describe.skipIf(!hasTestMongo)('insurer-owned policies and claims', () => {
  const holder = String(new mongoose.Types.ObjectId())
  const insurer = String(new mongoose.Types.ObjectId())
  const unlicensed = String(new mongoose.Types.ObjectId())
  const admin = String(new mongoose.Types.ObjectId())
  const productIds: string[] = []
  let server: Server
  let base = ''
  let productId = ''
  let unverifiedProductId = ''

  const token = (userId: string, roles: string[], permissions: string[] = []) =>
    jwt.sign({ userId, roles, permissions, purpose: 'session' }, config.jwtSecret, { expiresIn: '5m' })
  const holderToken = token(holder, ['tenant'])
  const insurerToken = token(insurer, ['business'])
  const adminToken = token(admin, ['admin'], ['insurance:review_claims'])
  const call = (path: string, auth: string, body?: unknown) => fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const balance = async (userId: string) => (await Wallet.findOne({ userId }).lean())?.balance ?? 0
  const today = () => new Date().toISOString().slice(0, 10)

  async function issuedPolicy() {
    const bought = await call('/api/insurance/policies', holderToken, { productId, termMonths: 12 })
    expect(bought.status).toBe(201)
    const policyId = (await bought.json()).data.policy.id as string
    expect((await call(`/api/insurance/providers/me/policies/${policyId}/issue`, insurerToken, { insurerPolicyNumber: `INS-${policyId}` })).status).toBe(200)
    return policyId
  }
  async function claim(policyId: string, amount = 400) {
    const res = await call(`/api/insurance/policies/${policyId}/claim`, holderToken, { amount, description: 'Burst pipe damaged furniture', incidentDate: today() })
    expect(res.status).toBe(201)
    return (await res.json()).data.claim.id as string
  }

  beforeAll(async () => {
    await mongoose.connect(uri)
    await Promise.all([Wallet.init(), InsurancePolicy.init(), InsuranceProviderProfile.init()])
    vi.spyOn(User, 'exists').mockResolvedValue({ _id: new mongoose.Types.ObjectId() })
    const profile = await InsuranceProviderProfile.create({ userId: insurer, institutionName: 'Fixture Assurance', licenseNumber: 'NIC-FIXTURE-1', contactEmail: 'ins@example.com', contactPhone: '0300000000', approvalStatus: 'approved', approvedBy: admin, approvedAt: new Date() })
    const pending = await InsuranceProviderProfile.create({ userId: unlicensed, institutionName: 'Pending Assurance', licenseNumber: 'NIC-FIXTURE-2', contactEmail: 'p@example.com', contactPhone: '0300000001' })
    const [product, unverified] = await InsuranceProduct.create([
      { providerId: profile._id.toString(), providerName: 'Fixture Assurance', productName: 'Fixture Renters', category: 'renters', description: 'd', coverageDetails: 'c', monthlyPremium: 25, coverageLimit: 1000, excessAmount: 0, active: true },
      { providerId: pending._id.toString(), providerName: 'Pending Assurance', productName: 'Unverified Renters', category: 'renters', description: 'd', coverageDetails: 'c', monthlyPremium: 25, coverageLimit: 1000, excessAmount: 0, active: true },
    ])
    productId = product._id.toString(); unverifiedProductId = unverified._id.toString()
    productIds.push(productId, unverifiedProductId)
    await Wallet.create([{ userId: holder, balance: 5000, transactions: [] }, { userId: insurer, balance: 5000, transactions: [] }])
    const app = express(); app.use(express.json())
    app.use('/api/insurance/providers', providerRouter); app.use('/api/insurance', insuranceRouter); app.use(errorHandler)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    vi.restoreAllMocks()
    await Promise.all([
      InsurancePolicy.deleteMany({ userId: holder }), InsuranceProduct.deleteMany({ _id: { $in: productIds } }),
      InsuranceProviderProfile.deleteMany({ userId: { $in: [insurer, unlicensed] } }), Wallet.deleteMany({ userId: { $in: [holder, insurer] } }),
    ])
    await mongoose.disconnect()
  })

  it('sells only products of an approved, licence-verified insurer', async () => {
    const { data } = await (await call('/api/insurance/products', holderToken)).json()
    const ids = data.items.map((p: { id: string }) => p.id)
    expect(ids).toContain(productId)
    expect(ids).not.toContain(unverifiedProductId)
    expect((await call('/api/insurance/policies', holderToken, { productId: unverifiedProductId })).status).toBe(400)
  })

  it('charges the whole term up front and passes the premium to the insurer only on issuance', async () => {
    const holderBefore = await balance(holder)
    const insurerBefore = await balance(insurer)
    const bought = await call('/api/insurance/policies', holderToken, { productId, termMonths: 12 })
    const policyId = (await bought.json()).data.policy.id
    expect(await balance(holder)).toBe(holderBefore - 300)
    expect((await InsurancePolicy.findById(policyId).lean())).toMatchObject({ status: 'pending', premiumPaid: 300, termMonths: 12 })
    expect(await balance(insurer)).toBe(insurerBefore)
    await call(`/api/insurance/providers/me/policies/${policyId}/issue`, insurerToken, { insurerPolicyNumber: 'INS-ISSUE-1' })
    expect((await InsurancePolicy.findById(policyId).lean())).toMatchObject({ status: 'active', insurerPolicyNumber: 'INS-ISSUE-1' })
    expect(await balance(insurer)).toBe(insurerBefore + 300)
  })

  it('rejects claims outside the cover period or above the cover', async () => {
    const policyId = await issuedPolicy()
    const bad = (body: Record<string, unknown>) => call(`/api/insurance/policies/${policyId}/claim`, holderToken, { amount: 100, description: 'Burst pipe damaged furniture', incidentDate: today(), ...body })
    expect((await bad({ incidentDate: '2020-01-01' })).status).toBe(400)
    expect((await bad({ incidentDate: '2999-01-01' })).status).toBe(400)
    expect((await bad({ amount: 5000 })).status).toBe(400)
  })

  it('the insurer decides and pays from its own wallet; the payout is stated and capped', async () => {
    const policyId = await issuedPolicy()
    const claimId = await claim(policyId, 400)
    const decide = (body: Record<string, unknown>) => call(`/api/insurance/providers/me/policies/${policyId}/claims/${claimId}/decide`, insurerToken, body)
    expect((await decide({ decision: 'approved' })).status).toBe(400)
    expect((await decide({ decision: 'approved', payoutAmount: 450 })).status).toBe(400)
    const holderBefore = await balance(holder)
    const insurerBefore = await balance(insurer)
    expect((await decide({ decision: 'approved', payoutAmount: 350, notes: 'Excess applied' })).status).toBe(200)
    expect(await balance(holder)).toBe(holderBefore + 350)
    expect(await balance(insurer)).toBe(insurerBefore - 350)
    const stored = (await InsurancePolicy.findById(policyId).lean())!.claims.find(c => c.id === claimId)
    expect(stored).toMatchObject({ status: 'paid', payoutAmount: 350, decisionSource: 'provider', decidedBy: insurer })
  })

  it('an admin can only record the insurer’s decision, with its reference and a unique settlement', async () => {
    const policyId = await issuedPolicy()
    const first = await claim(policyId, 100)
    const second = await claim(policyId, 100)
    const record = (claimId: string, body: Record<string, unknown>) => call(`/api/insurance/policies/${policyId}/claims/${claimId}/decide`, adminToken, body)
    expect((await record(first, { decision: 'approved', payoutAmount: 100, settlementReference: 'SETTLE-A1' })).status).toBe(400)
    expect((await record(first, { decision: 'approved', providerReference: 'INS-DEC-1', settlementReference: 'SETTLE-A1' })).status).toBe(400)
    const holderBefore = await balance(holder)
    const reference = `SETTLE-${policyId}`
    expect((await record(first, { decision: 'approved', providerReference: 'INS-DEC-1', payoutAmount: 100, settlementReference: reference })).status).toBe(200)
    expect(await balance(holder)).toBe(holderBefore + 100)
    expect((await record(second, { decision: 'approved', providerReference: 'INS-DEC-2', payoutAmount: 100, settlementReference: reference })).status).toBe(409)
    const stored = (await InsurancePolicy.findById(policyId).lean())!.claims.find(c => c.id === first)
    expect(stored).toMatchObject({ status: 'paid', decisionSource: 'admin_recorded', providerReference: 'INS-DEC-1', payoutReference: reference })
  })

  it('a declined application is refunded', async () => {
    const holderBefore = await balance(holder)
    const policyId = (await (await call('/api/insurance/policies', holderToken, { productId, termMonths: 3 })).json()).data.policy.id
    expect(await balance(holder)).toBe(holderBefore - 75)
    expect((await call(`/api/insurance/providers/me/policies/${policyId}/decline`, insurerToken, { reason: 'Outside underwriting area' })).status).toBe(200)
    expect(await balance(holder)).toBe(holderBefore)
    expect((await InsurancePolicy.findById(policyId).lean())?.status).toBe('cancelled')
  })
})

import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { Agreement } from '../models/Agreement.js'
import { FinancierProfile } from '../models/FinancierProfile.js'
import { FinancingOffer } from '../models/FinancingOffer.js'
import { FinancingApplication } from '../models/FinancingApplication.js'
import { FinancingContract } from '../models/FinancingContract.js'
import { Wallet } from '../models/Wallet.js'
import { errorHandler } from '../middleware/errorHandler.js'
import router from '../routes/financing.js'

vi.mock('../services/notify.js', () => ({ notify: vi.fn().mockResolvedValue(undefined) }))

const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('rent-advance financing compliance', () => {
  const financier = String(new mongoose.Types.ObjectId())
  const pendingFinancier = String(new mongoose.Types.ObjectId())
  const users: string[] = []
  const agreementIds: string[] = []
  let server: Server
  let base = ''
  let offerId = ''
  let hiddenOfferId = ''

  const token = (userId: string, roles: string[], permissions: string[] = []) =>
    jwt.sign({ userId, roles, permissions, purpose: 'session' }, config.jwtSecret, { expiresIn: '5m' })
  const financierToken = token(financier, ['financier'], ['financing:offer', 'financing:approve', 'financing:disburse'])
  const call = (path: string, auth: string, body?: unknown) => fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const balance = async (userId: string) => (await Wallet.findOne({ userId }).lean())?.balance ?? 0

  async function tenant(opts: { status?: string; endDate?: string } = {}) {
    const userId = String(new mongoose.Types.ObjectId()); users.push(userId)
    const landlord = `landlord-${userId}`; users.push(landlord)
    const status = opts.status ?? 'active'
    const agreement = await Agreement.create({
      propertyId: `prop-${userId}`, landlordId: landlord, tenantId: userId, status,
      startDate: '2026-01-01', endDate: opts.endDate ?? '2026-12-31', rentAmount: 1000, advanceMonths: 1,
      ...(status === 'active' ? { tenantSignature: '2026-01-01', landlordSignature: '2026-01-01' } : {}),
    })
    agreementIds.push(agreement._id.toString())
    return { userId, landlord, agreementId: agreement._id.toString(), auth: token(userId, ['tenant']) }
  }
  const apply = (t: { auth: string; agreementId?: string }, body: Record<string, unknown> = {}) => call('/api/financing/applications', t.auth, {
    offerId, amountRequested: 3000, tenureMonths: 6, purpose: 'Advance rent to landlord', agreementId: t.agreementId, advanceMonths: 3, ...body,
  })

  async function signedContract() {
    const t = await tenant()
    const app = await (await apply(t)).json()
    const approved = await (await call(`/api/financing/applications/${app.data.id}/approve`, financierToken, {})).json()
    const contractId = approved.data.contract.id as string
    expect((await call(`/api/financing/contracts/${contractId}/sign`, t.auth, { signature: 'Ama Mensah', acceptTerms: true })).status).toBe(200)
    return { ...t, contractId }
  }

  beforeAll(async () => {
    await mongoose.connect(uri)
    await Promise.all([Wallet.init(), FinancingContract.init(), FinancierProfile.init()])
    vi.spyOn(User, 'exists').mockResolvedValue({ _id: new mongoose.Types.ObjectId() })
    vi.spyOn(User, 'findById').mockResolvedValue(null)
    await FinancierProfile.create([
      { userId: financier, institutionName: 'Fixture Finance', licenseNumber: 'BOG-FIXTURE-1', contactEmail: 'f@example.com', contactPhone: '0300000000', approvalStatus: 'approved', approvedBy: 'admin', approvedAt: new Date() },
      { userId: pendingFinancier, institutionName: 'Pending Finance', licenseNumber: 'BOG-FIXTURE-2', contactEmail: 'p@example.com', contactPhone: '0300000001' },
    ])
    const [offer, hidden] = await FinancingOffer.create([
      { financierId: financier, name: 'Fixture Rent Advance', productType: 'rent_advance', minAmount: 500, maxAmount: 20000, minTenureMonths: 3, maxTenureMonths: 12, annualInterestRate: 20, processingFeePct: 2, requiresEmployment: false, active: true },
      { financierId: pendingFinancier, name: 'Hidden Advance', productType: 'rent_advance', minAmount: 500, maxAmount: 20000, minTenureMonths: 3, maxTenureMonths: 12, annualInterestRate: 20, processingFeePct: 2, requiresEmployment: false, active: true },
    ])
    offerId = offer._id.toString(); hiddenOfferId = hidden._id.toString()
    await Wallet.create({ userId: financier, balance: 100000, transactions: [] })
    const app = express(); app.use(express.json()); app.use('/api/financing', router); app.use(errorHandler)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    vi.restoreAllMocks()
    await Promise.all([
      FinancingOffer.deleteMany({ financierId: { $in: [financier, pendingFinancier] } }),
      FinancingApplication.deleteMany({ financierId: financier }), FinancingContract.deleteMany({ financierId: financier }),
      FinancierProfile.deleteMany({ userId: { $in: [financier, pendingFinancier] } }),
      Agreement.deleteMany({ _id: { $in: agreementIds } }), Wallet.deleteMany({ userId: { $in: [...users, financier] } }),
    ])
    await mongoose.disconnect()
  })

  it('lists offers only from approved, licence-verified financiers, with an APR that includes fees', async () => {
    const t = await tenant()
    const { data } = await (await call('/api/financing/offers', t.auth)).json()
    const ids = data.items.map((o: { id: string }) => o.id)
    expect(ids).toContain(offerId)
    expect(ids).not.toContain(hiddenOfferId)
    const offer = data.items.find((o: { id: string }) => o.id === offerId)
    expect(offer.aprRange.max).toBeGreaterThan(20)
  })

  it('requires a signed, active agreement for a rent advance', async () => {
    const t = await tenant()
    expect((await apply({ auth: t.auth })).status).toBe(400)
    const draft = await tenant({ status: 'draft' })
    expect((await apply(draft)).status).toBe(400)
  })

  it('caps a rent advance at the Rent Act s.25 limit for the tenancy', async () => {
    const t = await tenant()
    expect((await apply(t, { advanceMonths: 7, amountRequested: 7000 })).status).toBe(400)
    expect((await apply(t, { advanceMonths: 3, amountRequested: 3500 })).status).toBe(400)
    const monthly = await tenant({ endDate: '2026-01-31' })
    expect((await apply(monthly, { advanceMonths: 2, amountRequested: 2000 })).status).toBe(400)
    expect((await apply(t, { advanceMonths: 6, amountRequested: 6000 })).status).toBe(201)
  })

  it('a financier cannot apply to its own offer', async () => {
    const own = await Agreement.create({ propertyId: 'p-own', landlordId: 'l-own', tenantId: financier, status: 'active', startDate: '2026-01-01', endDate: '2026-12-31', rentAmount: 1000, tenantSignature: '2026-01-01', landlordSignature: '2026-01-01' })
    agreementIds.push(own._id.toString())
    expect((await apply({ auth: financierToken, agreementId: own._id.toString() })).status).toBe(403)
  })

  it('enforces offer bounds', async () => {
    const offer = { name: 'Bounds', productType: 'deposit_loan', minAmount: 500, maxAmount: 5000, minTenureMonths: 3, maxTenureMonths: 12, annualInterestRate: 20 }
    expect((await call('/api/financing/offers', financierToken, { ...offer, minTenureMonths: 1 })).status).toBe(400)
    expect((await call('/api/financing/offers', financierToken, { ...offer, annualInterestRate: 99 })).status).toBe(400)
    expect((await call('/api/financing/offers', financierToken, { ...offer, maxAmount: 10_000_000 })).status).toBe(400)
  })

  it('parallel approvals create exactly one contract', async () => {
    const t = await tenant()
    const app = await (await apply(t)).json()
    const results = await Promise.all(Array.from({ length: 5 }, () => call(`/api/financing/applications/${app.data.id}/approve`, financierToken, {})))
    expect(results.filter(r => r.status === 200)).toHaveLength(1)
    expect(await FinancingContract.countDocuments({ applicationId: app.data.id })).toBe(1)
  })

  it('keeps the signature evidence and the terms it covers', async () => {
    const { contractId } = await signedContract()
    const contract = await FinancingContract.findById(contractId).lean()
    expect(contract?.applicantSignature).toMatchObject({ name: 'Ama Mensah' })
    expect(contract?.applicantSignature?.termsHash).toMatch(/^[a-f0-9]{64}$/)
    expect(contract?.applicantSignature?.signedAt).toBeInstanceOf(Date)
  })

  it('disbursement debits the financier for exactly what the landlord receives', async () => {
    const { contractId, landlord } = await signedContract()
    const before = await balance(financier)
    expect((await call(`/api/financing/contracts/${contractId}/disburse`, financierToken, { fundingSource: 'financier_wallet' })).status).toBe(200)
    const contract = await FinancingContract.findById(contractId).lean()
    const net = contract!.principal - contract!.processingFee
    expect(await balance(landlord)).toBe(net)
    expect(await balance(financier)).toBe(before - net)
    expect(contract?.fundingSource).toBe('financier_wallet')
  })

  it('an external settlement reference funds only one disbursement', async () => {
    const first = await signedContract()
    const second = await signedContract()
    const reference = `FIN-SETTLE-${first.contractId}`
    expect((await call(`/api/financing/contracts/${first.contractId}/disburse`, financierToken, { fundingSource: 'external_settlement', settlementReference: reference })).status).toBe(200)
    expect((await call(`/api/financing/contracts/${second.contractId}/disburse`, financierToken, { fundingSource: 'external_settlement', settlementReference: reference })).status).toBe(409)
    expect(await balance(second.landlord)).toBe(0)
    expect((await FinancingContract.findById(second.contractId).lean())?.status).toBe('pending_disbursement')
  })

  it('repayments reach the financier', async () => {
    const { contractId, userId, auth } = await signedContract()
    await call(`/api/financing/contracts/${contractId}/disburse`, financierToken, { fundingSource: 'financier_wallet' })
    await Wallet.create({ userId, balance: 1000, transactions: [] })
    const before = await balance(financier)
    expect((await call(`/api/financing/contracts/${contractId}/repay`, auth, { amount: 200 })).status).toBe(200)
    expect(await balance(financier)).toBe(before + 200)
  })

  it('a financier payment reminder honours the borrower\'s payment-reminder preference', async () => {
    const { contractId, userId } = await signedContract()
    const { notify } = await import('../services/notify.js')
    vi.mocked(notify).mockClear()
    expect((await call(`/api/financing/contracts/${contractId}/remind`, token(financier, ['financier'], ['financing:collect']), {})).status).toBe(200)
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId, title: 'Payment Reminder', category: 'payment' }))
  })
})

import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { Loan } from '../models/Loan.js'
import { Agreement } from '../models/Agreement.js'
import { CreditScore } from '../models/CreditScore.js'
import { FinancierProfile } from '../models/FinancierProfile.js'
import { Wallet } from '../models/Wallet.js'
import { errorHandler } from '../middleware/errorHandler.js'
import router from '../routes/loans.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../services/notify.js', () => ({ notify: vi.fn().mockResolvedValue(undefined) }))

const uri = testMongoUri
describe.skipIf(!hasTestMongo)('loan funding and single open loan', () => {
  const ids: string[] = []
  const agreementIds: string[] = []
  const lender = String(new mongoose.Types.ObjectId())
  let server: Server
  let base = ''

  const token = (userId: string, roles: string[], permissions: string[] = []) =>
    jwt.sign({ userId, roles, permissions, purpose: 'session' }, config.jwtSecret, { expiresIn: '5m' })
  const lenderToken = () => token(lender, ['financier'], ['financing:approve', 'financing:disburse'])
  const call = (path: string, auth: string, body?: unknown) => fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  async function borrower(score = 80, agreementStatus = 'active') {
    const userId = String(new mongoose.Types.ObjectId()); ids.push(userId)
    const agreement = await Agreement.create({
      propertyId: `prop-${userId}`, landlordId: `landlord-${userId}`, tenantId: userId, status: agreementStatus,
      startDate: '2026-01-01', endDate: '2026-12-31', rentAmount: 1000, advanceMonths: 1,
      ...(agreementStatus === 'active' ? { tenantSignature: '2026-01-01', landlordSignature: '2026-01-01' } : {}),
    })
    agreementIds.push(agreement._id.toString())
    await CreditScore.create({ userId, score, calculatedAt: '2026-09-01' })
    return { userId, agreementId: agreement._id.toString(), auth: token(userId, ['tenant']) }
  }

  async function apply(b: { agreementId: string; auth: string }, amount = 1000, tenure = 6) {
    const quote = await (await call(`/api/loans/quote?amount=${amount}&tenure=${tenure}`, b.auth)).json()
    return call('/api/loans/apply', b.auth, {
      agreementId: b.agreementId, amount, tenure, reason: 'Covering a gap before salary arrives',
      acceptTerms: true, quotedApr: quote.data.apr, quotedTotalRepayment: quote.data.totalRepayable,
    })
  }

  async function approvedLoan() {
    const b = await borrower()
    const applied = await (await apply(b)).json()
    const decided = await call(`/api/loans/${applied.data.id}/decide`, lenderToken(), { decision: 'approved', reason: 'Income and rent history verified' })
    expect(decided.status).toBe(200)
    return { ...b, loanId: applied.data.id as string }
  }

  const balance = async (userId: string) => (await Wallet.findOne({ userId }).lean())?.balance ?? 0

  beforeAll(async () => {
    await mongoose.connect(uri)
    await Promise.all([Loan.init(), Wallet.init(), CreditScore.init(), FinancierProfile.init()])
    vi.spyOn(User, 'exists').mockResolvedValue({ _id: new mongoose.Types.ObjectId() })
    await FinancierProfile.create({ userId: lender, institutionName: 'Fixture Lender', licenseNumber: 'FIXTURE-LIC-1', contactEmail: 'lender@example.com', contactPhone: '0300000000', approvalStatus: 'approved' })
    await Wallet.create({ userId: lender, balance: 100000, transactions: [] })
    const app = express(); app.use(express.json()); app.use('/api/loans', router); app.use(errorHandler)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    vi.restoreAllMocks()
    await Promise.all([
      Loan.deleteMany({ userId: { $in: ids } }), CreditScore.deleteMany({ userId: { $in: ids } }),
      Agreement.deleteMany({ _id: { $in: agreementIds } }), Wallet.deleteMany({ userId: { $in: [...ids, lender] } }),
      FinancierProfile.deleteMany({ userId: lender }),
    ])
    await mongoose.disconnect()
  })

  it('parallel applications leave exactly one open loan', async () => {
    const b = await borrower()
    const results = await Promise.all(Array.from({ length: 6 }, () => apply(b)))
    expect(results.filter(r => r.status === 201)).toHaveLength(1)
    expect(results.filter(r => r.status === 409)).toHaveLength(5)
    expect(await Loan.countDocuments({ userId: b.userId })).toBe(1)
  })

  it('score-only screening pre-qualifies and records the accepted terms, never approves', async () => {
    const b = await borrower(95)
    const res = await apply(b, 2000, 6)
    expect(res.status).toBe(201)
    const loan = await Loan.findOne({ userId: b.userId }).lean()
    expect(loan?.status).toBe('pre_qualified')
    expect(loan?.automatedAssessment?.reasons.length).toBeGreaterThan(0)
    expect(loan?.termsAcceptance?.acceptedAt).toBeInstanceOf(Date)
    expect(loan?.termsAcceptance?.snapshot).toMatchObject({ amount: 2000, tenure: 6, totalRepayment: loan?.totalRepayment, apr: loan?.apr })
    expect(loan?.termsAcceptance?.snapshot.schedule).toHaveLength(6)
  })

  it('rejects an unsigned draft agreement', async () => {
    const b = await borrower(80, 'draft')
    const res = await apply(b)
    expect(res.status).toBe(400)
    expect(await Loan.countDocuments({ userId: b.userId })).toBe(0)
  })

  it('a borrower cannot disburse their own approved loan', async () => {
    const { userId, auth, loanId } = await approvedLoan()
    const res = await call(`/api/loans/${loanId}/disburse`, auth, { fundingSource: 'lender_wallet' })
    expect(res.status).toBe(403)
    expect(await balance(userId)).toBe(0)
    expect((await Loan.findById(loanId).lean())?.status).toBe('approved')
  })

  it('lender-wallet disbursement moves the same money from lender to borrower', async () => {
    const { userId, loanId } = await approvedLoan()
    const lenderBefore = await balance(lender)
    const res = await call(`/api/loans/${loanId}/disburse`, lenderToken(), { fundingSource: 'lender_wallet' })
    expect(res.status).toBe(200)
    const loan = await Loan.findById(loanId).lean()
    expect(loan).toMatchObject({ status: 'active', fundingSource: 'lender_wallet', lenderId: lender, disbursedBy: lender })
    expect(await balance(userId)).toBe(1000)
    expect(await balance(lender)).toBe(lenderBefore - 1000)
  })

  it('refuses lender-wallet disbursement the lender cannot fund, leaving the loan approved', async () => {
    const { userId, loanId } = await approvedLoan()
    const poor = String(new mongoose.Types.ObjectId()); ids.push(poor)
    await FinancierProfile.create({ userId: poor, institutionName: 'Empty Lender', licenseNumber: 'FIXTURE-LIC-2', contactEmail: 'empty@example.com', contactPhone: '0300000001', approvalStatus: 'approved' })
    await Loan.updateOne({ _id: loanId }, { $unset: { lenderId: 1 } })
    const res = await call(`/api/loans/${loanId}/disburse`, token(poor, ['financier'], ['financing:disburse']), { fundingSource: 'lender_wallet' })
    await FinancierProfile.deleteMany({ userId: poor })
    expect(res.status).toBe(400)
    expect(await balance(userId)).toBe(0)
    expect((await Loan.findById(loanId).lean())?.status).toBe('approved')
  })

  it('one external settlement reference cannot back two disbursements', async () => {
    const first = await approvedLoan()
    const second = await approvedLoan()
    const reference = `SETTLE-${new mongoose.Types.ObjectId()}`
    expect((await call(`/api/loans/${first.loanId}/disburse`, lenderToken(), { fundingSource: 'external_settlement', settlementReference: reference })).status).toBe(200)
    expect((await call(`/api/loans/${second.loanId}/disburse`, lenderToken(), { fundingSource: 'external_settlement', settlementReference: reference })).status).toBe(409)
    expect(await balance(first.userId)).toBe(1000)
    expect(await balance(second.userId)).toBe(0)
    expect((await Loan.findById(second.loanId).lean())?.status).toBe('approved')
  })

  it('repayments of a lender-funded loan reach the lender', async () => {
    const { userId, auth, loanId } = await approvedLoan()
    await call(`/api/loans/${loanId}/disburse`, lenderToken(), { fundingSource: 'lender_wallet' })
    const lenderBefore = await balance(lender)
    const res = await call(`/api/loans/${loanId}/repay`, auth, { amount: 200 })
    expect(res.status).toBe(200)
    expect(await balance(userId)).toBe(800)
    expect(await balance(lender)).toBe(lenderBefore + 200)
  })
})

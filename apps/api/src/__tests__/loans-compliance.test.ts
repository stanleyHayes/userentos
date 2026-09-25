import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { config } from '../config/index.js'
import { Loan } from '../models/Loan.js'
import { Agreement } from '../models/Agreement.js'
import { CreditScore } from '../models/CreditScore.js'
import { creditWallet, debitWallet } from '../services/payments/walletLedger.js'

vi.mock('../models/User.js', () => ({ User: { exists: vi.fn().mockResolvedValue({ _id: 'active-user' }) } }))
vi.mock('../models/Agreement.js', () => ({ Agreement: { findById: vi.fn() } }))
vi.mock('../models/CreditScore.js', () => ({ CreditScore: { findOne: vi.fn() } }))
vi.mock('../models/Loan.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../models/Loan.js')>()),
  Loan: { find: vi.fn(), findOne: vi.fn(), findById: vi.fn(), create: vi.fn(), findOneAndUpdate: vi.fn(), exists: vi.fn() },
}))
vi.mock('../services/notify.js', () => ({ notify: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../services/payments/walletLedger.js', () => ({ creditWallet: vi.fn(), debitWallet: vi.fn() }))
vi.mock('../utils/audit.js', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }))

const { default: loansRouter } = await import('../routes/loans.js')

const BORROWER = '65f1a2b3c4d5e6f7a8b9c0d1'
const AGREEMENT = '65f1a2b3c4d5e6f7a8b9c0d2'
const token = (roles: string[], userId = BORROWER, permissions: string[] = []) =>
  jwt.sign({ userId, email: 'b@example.com', roles, permissions, purpose: 'session' }, config.jwtSecret)

const SIGNED = { _id: AGREEMENT, tenantId: BORROWER, status: 'active', tenantSignature: '2026-01-01', landlordSignature: '2026-01-01' }
function mockAgreement(agreement: unknown) {
  vi.mocked(Agreement.findById).mockReturnValue({ select: () => ({ lean: async () => agreement }) } as never)
}
function mockScore(score: number | null) {
  vi.mocked(CreditScore.findOne).mockReturnValue({ lean: async () => (score === null ? null : { score }) } as never)
}

describe('loans API compliance', () => {
  let server: Server
  let base = ''
  const post = (path: string, body: unknown, auth = token(['tenant'])) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` }, body: JSON.stringify(body),
  })
  const get = (path: string, auth = token(['tenant'])) => fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${auth}` } })

  async function application(overrides: Record<string, unknown> = {}) {
    const quote = (await (await get('/quote?amount=1000&tenure=6')).json()).data
    return { agreementId: AGREEMENT, amount: 1000, tenure: 6, reason: 'Covering a gap before salary arrives', acceptTerms: true, quotedApr: quote.apr, quotedTotalRepayment: quote.totalRepayable, ...overrides }
  }

  beforeAll(async () => {
    const app = express(); app.use(express.json()); app.use('/', loansRouter)
    await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => { await new Promise((resolve) => server.close(resolve)) })
  beforeEach(() => {
    vi.clearAllMocks()
    mockAgreement(SIGNED)
    mockScore(80)
    vi.mocked(Loan.exists).mockResolvedValue(null as never)
    vi.mocked(Loan.create).mockImplementation(async (doc: unknown) => ({ ...(doc as object), _id: 'loan-1', toObject: () => ({ ...(doc as object), _id: 'loan-1' }) }) as never)
  })

  it('publishes the server interest rate and a minimum term of at least three months', async () => {
    const res = await get('/terms')
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.annualInterestRate).toBe(Number(process.env.LOAN_INTEREST_RATE || 15))
    expect(data.minTenureMonths).toBeGreaterThanOrEqual(3)
  })

  it('quotes APR, total cost of credit and the full repayment schedule', async () => {
    const { data } = await (await get('/quote?amount=1200&tenure=6')).json()
    expect(data.apr).toBeGreaterThanOrEqual(data.annualInterestRate)
    expect(data.totalCostOfCredit).toBeCloseTo(data.totalRepayable - data.netDisbursed, 2)
    expect(data.schedule).toHaveLength(6)
    expect((await get('/quote?amount=1200&tenure=2')).status).toBe(400)
  })

  it('pre-qualifies a strong score instead of approving it, with reasons and the accepted terms', async () => {
    const res = await post('/apply', await application())
    expect(res.status).toBe(201)
    const doc = vi.mocked(Loan.create).mock.calls[0][0] as unknown as Record<string, never>
    expect(doc.status).toBe('pre_qualified')
    expect(doc.automatedAssessment).toMatchObject({ outcome: 'pre_qualified', creditScore: 80 })
    expect((doc.automatedAssessment as { reasons: string[] }).reasons.length).toBeGreaterThan(0)
    expect(doc.termsAcceptance).toMatchObject({ snapshot: { amount: 1000, tenure: 6 } })
  })

  it('declines a low score automatically but says why and offers human review', async () => {
    mockScore(30)
    const res = await post('/apply', await application())
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.message).toMatch(/review/i)
    const doc = vi.mocked(Loan.create).mock.calls[0][0] as unknown as Record<string, never>
    expect(doc.status).toBe('rejected')
    expect((doc.automatedAssessment as { outcome: string; reasons: string[] }).outcome).toBe('declined')
    expect((doc.automatedAssessment as { reasons: string[] }).reasons.join(' ')).toMatch(/30/)
  })

  it('moves an automated decline to human review on request', async () => {
    vi.mocked(Loan.findOneAndUpdate).mockResolvedValue({ _id: 'loan-1', status: 'pending_review', toObject: () => ({ _id: 'loan-1', status: 'pending_review' }) } as never)
    const res = await post('/loan-1/request-review', {})
    expect(res.status).toBe(200)
    const [filter, update] = vi.mocked(Loan.findOneAndUpdate).mock.calls[0] as unknown as [Record<string, unknown>, Record<string, Record<string, unknown>>]
    expect(filter).toMatchObject({ userId: BORROWER, status: 'rejected', 'automatedAssessment.outcome': 'declined' })
    expect(update.$set.status).toBe('pending_review')
  })

  it.each([
    ['a draft agreement', { ...SIGNED, status: 'draft' }],
    ['an unsigned agreement', { ...SIGNED, landlordSignature: undefined }],
    ['someone else’s agreement', { ...SIGNED, tenantId: 'someone-else' }],
  ])('refuses %s', async (_label, agreement) => {
    mockAgreement(agreement)
    expect((await post('/apply', await application())).status).toBe(400)
    expect(vi.mocked(Loan.create)).not.toHaveBeenCalled()
  })

  it('refuses repayment terms shorter than three months', async () => {
    expect((await post('/apply', await application({ tenure: 2 }))).status).toBe(400)
    expect(vi.mocked(Loan.create)).not.toHaveBeenCalled()
  })

  it('refuses an application whose accepted terms differ from the server quote', async () => {
    const res = await post('/apply', await application({ quotedApr: 1 }))
    expect(res.status).toBe(409)
    expect(vi.mocked(Loan.create)).not.toHaveBeenCalled()
  })

  it('requires explicit acceptance of the disclosed terms', async () => {
    expect((await post('/apply', await application({ acceptTerms: false }))).status).toBe(400)
  })

  it('turns the one-open-loan index violation into a conflict', async () => {
    vi.mocked(Loan.create).mockRejectedValue(Object.assign(new Error('E11000'), { code: 11000 }))
    expect((await post('/apply', await application())).status).toBe(409)
  })

  it('never lets a borrower disburse a loan to themselves', async () => {
    const res = await post('/loan-1/disburse', { fundingSource: 'external_settlement', settlementReference: 'REF-123456' })
    expect(res.status).toBe(403)
    expect(vi.mocked(creditWallet)).not.toHaveBeenCalled()
    expect(vi.mocked(debitWallet)).not.toHaveBeenCalled()
  })
})

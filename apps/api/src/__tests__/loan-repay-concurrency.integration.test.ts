import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../services/notify.js', () => ({ notify: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../services/achievements.js', () => ({ checkAndAward: vi.fn().mockResolvedValue(undefined) }))

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { Loan } = await import('../models/Loan.js')
const { FinancingContract } = await import('../models/FinancingContract.js')
const { Wallet } = await import('../models/Wallet.js')
const { creditWallet } = await import('../services/payments/walletLedger.js')
const { default: loanRouter } = await import('../routes/loans.js')
const { default: financingRouter } = await import('../routes/financing.js')

describe.skipIf(!hasTestMongo)('repayments that move wallet balances', () => {
  const users: string[] = []
  let server: Server, base = ''
  async function person(role: string) {
    const _id = new mongoose.Types.ObjectId(); users.push(String(_id))
    await User.create({ _id, email: `repay-${_id}@rentos.test`, phone: '0241234567', firstName: 'Repay', lastName: 'Fixture', passwordHash: 'fixture-only', roles: [role], activeRole: role })
    return { id: String(_id), auth: `Bearer ${jwt.sign({ userId: String(_id), roles: [role], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}` }
  }
  const post = (path: string, auth: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const wallet = (userId: string) => Wallet.findOne({ userId }).lean()

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await Promise.all([Loan.init(), Wallet.init(), FinancingContract.init()])
    const app = express(); app.use(express.json())
    app.use('/api/loans', loanRouter)
    app.use('/api/financing', financingRouter)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Loan.deleteMany({ userId: { $in: users } })
    await FinancingContract.deleteMany({ applicantId: { $in: users } })
    await Wallet.deleteMany({ userId: { $in: users } })
    await User.deleteMany({ _id: { $in: users } })
    await mongoose.disconnect()
  })

  it('five parallel full-balance loan repayments settle once: no overpayment, one lender credit, one ledger entry each', async () => {
    const borrower = await person('tenant')
    const lender = await person('financier')
    await creditWallet(borrower.id, 1000, { type: 'deposit', reference: `SEED-${borrower.id}` })
    const loan = await Loan.create({
      userId: borrower.id, agreementId: `agreement-${borrower.id}`, amount: 500, interestRate: 15, tenure: 6, monthlyPayment: 90,
      totalRepayment: 540, amountPaid: 440, status: 'active', lenderId: lender.id, fundingSource: 'lender_wallet', reason: 'Covering a gap before salary arrives',
    })
    const responses = await Promise.all(Array.from({ length: 5 }, () => post(`/api/loans/${loan._id}/repay`, borrower.auth, { amount: 100 })))
    expect(responses.filter((r) => r.status === 200)).toHaveLength(1)

    expect(await Loan.findById(loan._id).lean()).toMatchObject({ amountPaid: 540, status: 'repaid' })
    const borrowerWallet = await wallet(borrower.id)
    expect(borrowerWallet?.balance).toBe(900)
    // The seed credit plus exactly one repayment entry: balance and ledger move together.
    expect(borrowerWallet?.transactions.filter((t) => t.type === 'withdrawal')).toHaveLength(1)
    expect(borrowerWallet?.transactions.at(-1)).toMatchObject({ amount: -100, balanceAfter: 900, description: 'Loan repayment' })
    const lenderWallet = await wallet(lender.id)
    expect(lenderWallet?.balance).toBe(100)
    expect(lenderWallet?.transactions).toHaveLength(1)
  })

  it('refuses a loan repayment the wallet cannot cover, leaving the loan as it was', async () => {
    const borrower = await person('tenant')
    await creditWallet(borrower.id, 10, { type: 'deposit', reference: `SEED-${borrower.id}` })
    const loan = await Loan.create({
      userId: borrower.id, agreementId: `agreement-${borrower.id}`, amount: 500, interestRate: 15, tenure: 6, monthlyPayment: 90,
      totalRepayment: 540, amountPaid: 0, status: 'active', fundingSource: 'external_settlement', reason: 'Covering a gap before salary arrives',
    })
    expect((await post(`/api/loans/${loan._id}/repay`, borrower.auth, { amount: 100 })).status).toBe(400)
    expect((await Loan.findById(loan._id).lean())?.amountPaid).toBe(0)
    expect((await wallet(borrower.id))?.balance).toBe(10)
  })

  const contract = (applicantId: string, financierId: string, status: 'active' | 'defaulted') => FinancingContract.create({
    applicationId: `application-${applicantId}`, financierId, applicantId, productType: 'rent_advance', principal: 200, annualInterestRate: 10,
    tenureMonths: 2, monthlyPayment: 105, totalRepayable: 210, amountRepaid: 0, status,
    schedule: [1, 2].map((i) => ({ installmentNumber: i, dueDate: `2026-0${i}-01`, principal: 100, interest: 5, amountDue: 105 })),
  })

  it('refuses a repayment on a defaulted financing contract before any money moves', async () => {
    const applicant = await person('tenant')
    const financier = await person('financier')
    await creditWallet(applicant.id, 500, { type: 'deposit', reference: `SEED-${applicant.id}` })
    const c = await contract(applicant.id, financier.id, 'defaulted')
    const res = await post(`/api/financing/contracts/${c._id}/repay`, applicant.auth, { amount: 100 })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/defaulted/)
    const w = await wallet(applicant.id)
    expect(w?.balance).toBe(500)
    // No debit-then-refund pair: nothing touched the wallet at all.
    expect(w?.transactions).toHaveLength(1)
  })

  it('records a financing repayment in the wallet ledger, refunding what could not be applied', async () => {
    const applicant = await person('tenant')
    const financier = await person('financier')
    await creditWallet(applicant.id, 500, { type: 'deposit', reference: `SEED-${applicant.id}` })
    const c = await contract(applicant.id, financier.id, 'active')
    const res = await post(`/api/financing/contracts/${c._id}/repay`, applicant.auth, { amount: 150 })
    expect(res.status).toBe(200)
    expect((await res.json()).data).toMatchObject({ applied: 150, walletBalance: 350 })
    const w = await wallet(applicant.id)
    expect(w?.balance).toBe(350)
    expect(w?.transactions.at(-1)).toMatchObject({ type: 'withdrawal', amount: -150, balanceAfter: 350 })
    expect((await wallet(financier.id))?.balance).toBe(150)
  })
})

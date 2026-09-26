import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../services/notify.js', () => ({ notify: vi.fn().mockResolvedValue(undefined) }))
// Lets a test make the tenant credit fail AFTER the landlord debit, inside the transfer.
const ledger = vi.hoisted(() => ({ failCreditTo: [] as string[] }))
vi.mock('../services/payments/walletLedger.js', async (orig) => {
  const actual = await orig() as typeof import('../services/payments/walletLedger.js')
  return {
    ...actual,
    creditWallet: vi.fn(async (...args: Parameters<typeof actual.creditWallet>) => {
      if (ledger.failCreditTo.includes(args[0])) throw new Error('credit write failed')
      return actual.creditWallet(...args)
    }),
  }
})

const { config } = await import('../config/index.js')
const { Wallet } = await import('../models/Wallet.js')
const { User } = await import('../models/User.js')
const { SavingsPlan } = await import('../models/SavingsPlan.js')
const { MoveOut } = await import('../models/MoveOut.js')
const { creditWallet, debitWallet } = await import('../services/payments/walletLedger.js')
const { withMoneyTransaction, transactionsSupported } = await import('../services/payments/moneyTransaction.js')
const { runSavingsAutoDebit, autoDebitPeriod } = await import('../services/payments/savingsAutoDebit.js')
const { default: moveOutRouter } = await import('../routes/moveOut.js')

describe.skipIf(!hasTestMongo)('money moving between documents', () => {
  const users: string[] = []
  const user = () => { const id = String(new mongoose.Types.ObjectId()); users.push(id); return id }
  const balance = async (userId: string) => (await Wallet.findOne({ userId }).lean())?.balance
  let replicaSet = false
  let server: Server, base = ''

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await Promise.all([Wallet.init(), SavingsPlan.init(), MoveOut.init()])
    replicaSet = await transactionsSupported()
    const app = express(); app.use(express.json()); app.use('/move-outs', moveOutRouter)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Wallet.deleteMany({ userId: { $in: users } })
    await SavingsPlan.deleteMany({ userId: { $in: users } })
    await MoveOut.deleteMany({ landlordId: { $in: users } })
    await User.deleteMany({ _id: { $in: users } })
    await mongoose.disconnect()
  })

  it('keeps balances on whole pesewas, so 0.70 - 0.40 leaves exactly 0.30 to spend', async () => {
    const id = user()
    await creditWallet(id, 0.7, { type: 'deposit', reference: `R-${id}-1` })
    expect(await debitWallet(id, 0.4, { type: 'withdrawal', reference: `R-${id}-2` })).toBe(true)
    // Unrounded, the balance was 0.29999999999999993 and this guard refused.
    expect(await debitWallet(id, 0.3, { type: 'withdrawal', reference: `R-${id}-3` })).toBe(true)
    expect(await balance(id)).toBe(0)
  })

  it('rolls back every write of a transfer when a later step throws', async (ctx) => {
    if (!replicaSet) ctx.skip()
    const from = user(), to = user()
    await creditWallet(from, 100, { type: 'deposit', reference: `R-${from}` })
    await expect(withMoneyTransaction(async ({ session }) => {
      expect(await debitWallet(from, 40, { type: 'withdrawal', reference: `T-${from}` }, { session })).toBe(true)
      await creditWallet(to, 40, { type: 'deposit', reference: `T-${from}` }, { session })
      throw new Error('crash between writes')
    })).rejects.toThrow('crash between writes')
    expect(await balance(from)).toBe(100)
    expect(await Wallet.findOne({ userId: to }).lean()).toBeNull()
  })

  describe('savings auto-debit', () => {
    const plan = async (userId: string, fields: Record<string, unknown> = {}) => SavingsPlan.create({
      userId, targetAmount: 1000, currentAmount: 0, frequency: 'daily', contributionAmount: 20,
      startDate: '2026-01-01', targetDate: '2027-01-01', status: 'active', autoDebit: true, ...fields,
    })

    it('two overlapping runs debit a plan once for the period, under a deterministic reference', async () => {
      const id = user()
      await creditWallet(id, 100, { type: 'deposit', reference: `R-${id}` })
      const p = await plan(id)
      const now = new Date()
      const results = await Promise.all([runSavingsAutoDebit({ now, planIds: [String(p._id)] }), runSavingsAutoDebit({ now, planIds: [String(p._id)] })])
      expect(results.reduce((sum, r) => sum + r.debited, 0)).toBe(1)
      expect(await balance(id)).toBe(80)
      const saved = await SavingsPlan.findById(p._id).lean()
      expect(saved).toMatchObject({ currentAmount: 20, lastAutoDebitPeriod: autoDebitPeriod(now) })
      const wallet = await Wallet.findOne({ userId: id }).lean()
      expect(wallet?.transactions.filter((t) => t.reference === `AUTODEBIT-${p._id}-${autoDebitPeriod(now)}`)).toHaveLength(1)
      // A third run the same day finds the period claimed.
      expect((await runSavingsAutoDebit({ now, planIds: [String(p._id)] })).debited).toBe(0)
    })

    it('an underfunded wallet leaves nothing claimed, so the next run tries again', async () => {
      const id = user()
      await creditWallet(id, 5, { type: 'deposit', reference: `R-${id}` })
      const p = await plan(id)
      expect(await runSavingsAutoDebit({ planIds: [String(p._id)] })).toMatchObject({ insufficient: 1, debited: 0 })
      const saved = await SavingsPlan.findById(p._id).lean()
      expect(saved?.lastAutoDebitPeriod).toBeUndefined()
      expect(saved?.lastAutoDebitAt).toBeUndefined()
      expect(saved?.currentAmount).toBe(0)
      expect(await balance(id)).toBe(5)
    })
  })

  describe('move-out deposit refund', () => {
    const headersFor = (landlordId: string) => ({ Authorization: `Bearer ${jwt.sign({ userId: landlordId, roles: ['landlord'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`, 'Content-Type': 'application/json' })
    async function fixture() {
      const landlordId = user(), tenantId = user()
      await User.create({ _id: landlordId, email: `moveout-${landlordId}@rentos.test`, phone: '0240000009', firstName: 'Move', lastName: 'Out', passwordHash: 'fixture', roles: ['landlord'], activeRole: 'landlord' })
      await creditWallet(landlordId, 500, { type: 'deposit', reference: `R-${landlordId}` })
      const mo = await MoveOut.create({
        agreementId: String(new mongoose.Types.ObjectId()), tenantId, landlordId, propertyId: 'refund-property', status: 'refund_pending', initiatedBy: 'tenant',
        moveOutDate: '2026-06-01', damages: [], securityDeposit: 200, deductionsTotal: 0, refundAmount: 200, notes: [],
      })
      return { landlordId, tenantId, mo }
    }
    const refund = (moId: string, landlordId: string) => fetch(`${base}/move-outs/${moId}/process-refund`, { method: 'POST', headers: headersFor(landlordId), body: '{}' })

    it('a failed tenant credit rolls back the landlord debit and the settled status, with no compensating write to rely on', async (ctx) => {
      if (!replicaSet) ctx.skip()
      const { landlordId, tenantId, mo } = await fixture()
      // Like a crash mid-transfer: the tenant credit fails and so would any
      // compensating credit to the landlord. Only a transaction leaves both
      // wallets and the move-out as they were.
      ledger.failCreditTo = [tenantId, landlordId]
      try {
        expect((await refund(mo.id, landlordId)).status).toBe(500)
      } finally {
        ledger.failCreditTo = []
      }
      expect(await balance(landlordId)).toBe(500)
      expect(await Wallet.findOne({ userId: tenantId }).lean()).toBeNull()
      const stored = await MoveOut.findById(mo.id).lean()
      expect(stored?.status).toBe('refund_pending')
      expect(stored?.refundReference).toBeUndefined()
    })

    it('five concurrent refund calls transfer the deposit once', async () => {
      const { landlordId, tenantId, mo } = await fixture()
      const statuses = (await Promise.all(Array.from({ length: 5 }, () => refund(mo.id, landlordId)))).map((r) => r.status)
      expect(statuses.filter((s) => s === 200)).toHaveLength(1)
      expect(statuses.filter((s) => s === 409)).toHaveLength(4)
      expect(await balance(landlordId)).toBe(300)
      expect(await balance(tenantId)).toBe(200)
      expect((await MoveOut.findById(mo.id).lean())?.status).toBe('refund_paid')
    })

    it('an underfunded landlord leaves the move-out unsettled', async () => {
      const { landlordId, tenantId, mo } = await fixture()
      await debitWallet(landlordId, 450, { type: 'withdrawal', reference: `D-${landlordId}` })
      expect((await refund(mo.id, landlordId)).status).toBe(400)
      expect(await balance(landlordId)).toBe(50)
      expect(await Wallet.findOne({ userId: tenantId }).lean()).toBeNull()
      expect((await MoveOut.findById(mo.id).lean())?.status).toBe('refund_pending')
    })
  })
})

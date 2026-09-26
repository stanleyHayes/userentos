import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import { createHmac } from 'node:crypto'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../services/notify.js', () => ({ notify: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../utils/audit.js', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined), recordAuditEntry: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../models/AuditLog.js', () => ({ AuditLog: { create: vi.fn().mockResolvedValue({}) } }))
// Lets a test make the durable wallet credit fail once, like a dropped connection mid-refund.
const faults = vi.hoisted(() => ({ applyThrows: 0 }))
vi.mock('../services/payments/durableWalletCredit.js', async (orig) => {
  const actual = await orig() as typeof import('../services/payments/durableWalletCredit.js')
  return {
    ...actual,
    applyWalletCredit: vi.fn(async (operationKey: string) => {
      if (faults.applyThrows > 0) { faults.applyThrows--; throw new Error('wallet write failed') }
      return actual.applyWalletCredit(operationKey)
    }),
  }
})

const SECRET = 'sk_test_payout_reversal'
process.env.PAYSTACK_SECRET_KEY = SECRET
process.env.PAYMENTS_PROVIDER_MODE = 'simulated'
const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { Wallet } = await import('../models/Wallet.js')
const { WalletCredit } = await import('../models/WalletCredit.js')
const { Payout } = await import('../models/Payout.js')
const { WebhookEvent } = await import('../models/WebhookEvent.js')
const { PayoutAccount } = await import('../models/PayoutAccount.js')
const { creditWallet } = await import('../services/payments/walletLedger.js')
const { recoverPayoutRefunds } = await import('../services/payouts/refund.js')
const { reconcileUncertainPayouts, WEBHOOK_OVERDUE_MS } = await import('../services/payouts/reconcile.js')
const { simulatedPayoutProvider } = await import('../services/payouts/simulator.js')
const { default: payoutRouter } = await import('../routes/payouts.js')
const { default: paystackRoutes } = await import('../routes/paystackWebhooks.js')

describe.skipIf(!hasTestMongo)('payout reversals and durable refunds', () => {
  const payee = new mongoose.Types.ObjectId(), admin = new mongoose.Types.ObjectId()
  const userId = String(payee)
  const tag = userId.slice(-8)
  let server: Server, base = ''
  let n = 0
  const headers = (id: mongoose.Types.ObjectId, roles: string[]) => ({
    Authorization: `Bearer ${jwt.sign({ userId: String(id), roles, permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`,
    'Content-Type': 'application/json',
  })
  const balance = async () => (await Wallet.findOne({ userId }).lean())?.balance ?? 0
  const sign = (body: string) => createHmac('sha512', SECRET).update(body, 'utf8').digest('hex')
  const reversed = (p: { reference: string }, i = 0) => {
    const body = JSON.stringify({ event: 'transfer.reversed', data: { id: `${p.reference}-trf`, reference: p.reference, transfer_code: `TRF_${p.reference}`, amount: 5000, reason: `reversal-${i}` } })
    return fetch(`${base}/api/webhooks/paystack`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-paystack-signature': sign(body) }, body })
  }
  const payout = (fields: Record<string, unknown>) => Payout.create({
    userId, amount: 50, reference: `PO-${tag}-${++n}`, status: 'paid', paidAt: new Date(),
    destination: { type: 'mobile_money', accountNumber: '0244123456', bankName: 'MTN Mobile Money', accountName: 'Pay Fixture', recipientCode: 'SIM-RCP-FIXTURE' }, ...fields,
  })
  const credits = (p: { _id: unknown }) => WalletCredit.countDocuments({ operationKey: `payout-refund:v1:${String(p._id)}` })

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await Promise.all([Payout.init(), Wallet.init(), WalletCredit.init(), WebhookEvent.init()])
    await User.create([payee, admin].map((_id, i) => ({
      _id, email: `reversal-${i}-${_id}@rentos.test`, phone: '0241234567', firstName: 'Pay', lastName: 'Fixture',
      passwordHash: 'fixture-only', roles: [i ? 'super_admin' : 'landlord'], activeRole: i ? 'super_admin' : 'landlord',
    })))
    await PayoutAccount.create({ userId, type: 'mobile_money', accountNumber: '0244123456', bankCode: 'MTN', bankName: 'MTN Mobile Money', accountName: 'Pay Fixture', recipientCode: 'SIM-RCP-FIXTURE', verified: true })
    await creditWallet(userId, 100, { type: 'deposit', reference: `SEED-${tag}` })
    const app = express()
    app.use('/api/webhooks/paystack', paystackRoutes)
    app.use(express.json())
    app.use('/payouts', payoutRouter)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterEach(() => { vi.restoreAllMocks(); faults.applyThrows = 0 })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Payout.deleteMany({ userId })
    await PayoutAccount.deleteOne({ userId })
    await Wallet.deleteMany({ userId })
    await WalletCredit.deleteMany({ userId })
    await WebhookEvent.deleteMany({ eventId: { $regex: `PO-${tag}-` } })
    await User.deleteMany({ _id: { $in: [payee, admin] } })
    await mongoose.disconnect()
  })

  it('a transfer reversed after it was paid is refunded exactly once, however many times the event arrives', async () => {
    const p = await payout({})
    const before = await balance()
    const statuses = (await Promise.all(Array.from({ length: 5 }, () => reversed(p)))).map((r) => r.status)
    expect(statuses.every((s) => s === 200)).toBe(true)
    expect(await Payout.findById(p._id).lean()).toMatchObject({ status: 'reversed', refunded: true, reversedAt: expect.any(Date), refundCompletedAt: expect.any(Date) })
    expect(await balance()).toBe(before + 50)
    expect(await credits(p)).toBe(1)
  })

  it('keeps a refund whose wallet credit failed, and recovery applies it once', async () => {
    const p = await payout({})
    const before = await balance()
    faults.applyThrows = 1
    expect((await reversed(p)).status).toBe(200)
    const held = await Payout.findById(p._id).lean()
    expect(held).toMatchObject({ status: 'reversed', refundIntent: expect.objectContaining({ operationKey: `payout-refund:v1:${p._id}`, amount: 50 }) })
    expect(held?.refundCompletedAt).toBeUndefined()
    expect(await balance()).toBe(before)

    await Promise.all([recoverPayoutRefunds({ scope: { userId } }), recoverPayoutRefunds({ scope: { userId } })])
    expect(await balance()).toBe(before + 50)
    expect(await credits(p)).toBe(1)
    expect((await Payout.findById(p._id).lean())?.refundCompletedAt).toBeInstanceOf(Date)
    // Nothing left to recover.
    expect(await recoverPayoutRefunds({ scope: { userId } })).toEqual({ completed: 0, deferred: 0 })
  })

  it('five concurrent declines refund once', async () => {
    const res = await fetch(`${base}/payouts`, { method: 'POST', headers: headers(payee, ['landlord']), body: JSON.stringify({ amount: 20 }) })
    expect(res.status).toBe(201)
    const payoutId = (await res.json()).data.id as string
    const afterRequest = await balance()
    const statuses = (await Promise.all(Array.from({ length: 5 }, () => fetch(`${base}/payouts/${payoutId}/decline`, { method: 'POST', headers: headers(admin, ['super_admin']), body: JSON.stringify({ reason: 'Account mismatch' }) })))).map((r) => r.status)
    expect(statuses.filter((s) => s === 200)).toHaveLength(1)
    expect(statuses.filter((s) => s === 404)).toHaveLength(4)
    expect(await balance()).toBe(afterRequest + 20)
    expect(await credits({ _id: payoutId })).toBe(1)
  })

  it('polls a normally accepted transfer once its webhook is overdue, without waiting for a manual hold', async () => {
    const res = await fetch(`${base}/payouts`, { method: 'POST', headers: headers(payee, ['landlord']), body: JSON.stringify({ amount: 20 }) })
    const payoutId = (await res.json()).data.id as string
    // The provider accepts the transfer; its webhook never arrives.
    vi.spyOn(simulatedPayoutProvider, 'sendTransfer').mockResolvedValueOnce({ providerRef: `TRF-${tag}-quiet`, status: 'pending' })
    expect((await fetch(`${base}/payouts/${payoutId}/approve`, { method: 'POST', headers: headers(admin, ['super_admin']) })).status).toBe(200)
    const approved = await Payout.findById(payoutId).lean()
    expect(approved?.needsReconciliation).toBeUndefined()
    expect(approved?.nextReconcileAt?.getTime()).toBe(approved!.approvedAt!.getTime() + WEBHOOK_OVERDUE_MS)

    const verify = vi.spyOn(simulatedPayoutProvider, 'verifyTransfer').mockResolvedValue({ status: 'paid', providerRef: `TRF-${tag}-quiet`, amount: 20 })
    const sweep = (at: number) => reconcileUncertainPayouts({ now: new Date(approved!.approvedAt!.getTime() + at), userIds: [userId] })
    // Not yet overdue.
    expect((await sweep(10 * 60_000)).examined).toBe(0)
    expect(verify).not.toHaveBeenCalled()
    expect(await sweep(WEBHOOK_OVERDUE_MS + 60_000)).toMatchObject({ examined: 1, settled: 1 })
    expect((await Payout.findById(payoutId).lean())?.status).toBe('paid')
  })
})

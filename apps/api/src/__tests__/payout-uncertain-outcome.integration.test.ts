import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
vi.mock('../services/notify.js', () => ({ notify: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../utils/audit.js', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined), recordAuditEntry: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../models/AuditLog.js', () => ({ AuditLog: { create: vi.fn().mockResolvedValue({}) } }))
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { Wallet } from '../models/Wallet.js'
import { Payout } from '../models/Payout.js'
import { PayoutAccount } from '../models/PayoutAccount.js'
import { creditWallet } from '../services/payments/walletLedger.js'
import { simulatedPayoutProvider } from '../services/payouts/simulator.js'
import { TransferRejectedError } from '../services/payouts/types.js'
import router from '../routes/payouts.js'
import { reconcileUncertainPayouts, RECONCILE_MIN_AGE_MS } from '../services/payouts/reconcile.js'
import { reloadRegulatedFeatures } from '../config/regulatedFeatures.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

process.env.PAYMENTS_PROVIDER_MODE = 'simulated'

const uri = testMongoUri
describe.skipIf(!hasTestMongo)('payouts whose transfer outcome is unknown', () => {
  const payee = new mongoose.Types.ObjectId(), admin = new mongoose.Types.ObjectId()
  let server: Server, url: string
  const headers = (id: mongoose.Types.ObjectId, roles: string[]) => ({
    Authorization: `Bearer ${jwt.sign({ userId: String(id), roles, permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`,
    'Content-Type': 'application/json',
  })
  const asPayee = headers(payee, ['landlord']), asAdmin = headers(admin, ['super_admin'])
  const balance = async () => (await Wallet.findOne({ userId: String(payee) }).lean())?.balance
  const request = async () => {
    const res = await fetch(url, { method: 'POST', headers: asPayee, body: JSON.stringify({ amount: 50 }) })
    expect(res.status).toBe(201)
    return (await res.json()).data.id as string
  }
  const act = (id: string, action: string, body: unknown = {}) =>
    fetch(`${url}/${id}/${action}`, { method: 'POST', headers: asAdmin, body: JSON.stringify(body) })

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create([payee, admin].map((_id, i) => ({
      _id, email: `payout-${i}-${_id}@rentos.test`, phone: '0241234567', firstName: 'Pay', lastName: 'Fixture',
      passwordHash: 'fixture-only', roles: [i ? 'super_admin' : 'landlord'], activeRole: i ? 'super_admin' : 'landlord',
    })))
    await PayoutAccount.create({ userId: String(payee), type: 'mobile_money', accountNumber: '0244123456', bankCode: 'MTN', bankName: 'MTN Mobile Money', accountName: 'Pay Fixture', recipientCode: 'SIM-RCP-FIXTURE', verified: true })
    await creditWallet(String(payee), 200, { type: 'deposit', reference: `PAYOUT-SEED-${payee}`, description: 'fixture' })
    const app = express(); app.use(express.json()); app.use('/payouts', router)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/payouts`
  })
  afterEach(() => vi.restoreAllMocks())
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    await Payout.deleteMany({ userId: String(payee) })
    await PayoutAccount.deleteOne({ userId: String(payee) })
    await Wallet.deleteMany({ userId: String(payee) })
    await User.deleteMany({ _id: { $in: [payee, admin] } })
    await mongoose.disconnect()
  })

  it('holds a timed-out transfer until the provider is asked, and never refunds a paid one', async () => {
    const id = await request()
    expect(await balance()).toBe(150)

    vi.spyOn(simulatedPayoutProvider, 'sendTransfer').mockRejectedValueOnce(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
    expect((await act(id, 'approve')).status).toBe(504)
    expect(await Payout.findById(id).lean()).toMatchObject({ status: 'processing', needsReconciliation: true, refunded: false })

    // Neither declined (refunding money that may have left) nor sent twice.
    expect((await act(id, 'decline', { reason: 'Looks stuck' })).status).toBe(404)
    expect((await act(id, 'approve')).status).toBe(409)
    expect(await balance()).toBe(150)

    // The provider says the transfer went through: paid, no refund.
    vi.spyOn(simulatedPayoutProvider, 'verifyTransfer').mockResolvedValueOnce({ status: 'paid', providerRef: 'SIM-TRF-LATE', amount: 50 })
    expect((await act(id, 'reconcile')).status).toBe(200)
    const settled = await Payout.findById(id).lean()
    expect(settled).toMatchObject({ status: 'paid', refunded: false })
    expect(settled?.needsReconciliation).toBeUndefined()
    expect(await balance()).toBe(150)
  })

  it('refunds exactly once when the provider says the unknown transfer failed', async () => {
    const id = await request()
    vi.spyOn(simulatedPayoutProvider, 'sendTransfer').mockRejectedValueOnce(new TypeError('fetch failed'))
    expect((await act(id, 'approve')).status).toBe(504)

    vi.spyOn(simulatedPayoutProvider, 'verifyTransfer').mockResolvedValue({ status: 'failed', failureReason: 'Transfer failed', amount: 50 })
    expect((await act(id, 'reconcile')).status).toBe(200)
    expect((await act(id, 'reconcile')).status).toBe(409)
    expect(await Payout.findById(id).lean()).toMatchObject({ status: 'failed', refunded: true })
    expect(await balance()).toBe(150)
  })

  it('returns a definitively rejected transfer to the queue, where decline refunds it', async () => {
    const id = await request()
    vi.spyOn(simulatedPayoutProvider, 'sendTransfer').mockRejectedValueOnce(new TransferRejectedError('Paystack /transfer failed (400): Insufficient balance'))
    expect((await act(id, 'approve')).status).toBe(502)
    expect((await Payout.findById(id).lean())?.status).toBe('requested')
    expect((await act(id, 'decline', { reason: 'Provider balance' })).status).toBe(200)
    expect(await balance()).toBe(150)
  })

  // Scoped to this payee: the database is shared with other suites.
  const sweep = (now?: Date) => reconcileUncertainPayouts({ now, userIds: [String(payee)] })

  it('the scheduled sweep reconciles held transfers through the same path, with backoff', async () => {
    const id = await request()
    const afterRequest = await balance()
    vi.spyOn(simulatedPayoutProvider, 'sendTransfer').mockRejectedValueOnce(new TypeError('fetch failed'))
    expect((await act(id, 'approve')).status).toBe(504)
    const verify = vi.spyOn(simulatedPayoutProvider, 'verifyTransfer').mockResolvedValue({ status: 'pending' })

    // Too fresh: the provider may simply not have answered yet.
    expect((await sweep()).examined).toBe(0)

    const approvedAt = (await Payout.findById(id).lean())!.approvedAt!
    const later = new Date(approvedAt.getTime() + RECONCILE_MIN_AGE_MS + 1000)
    expect(await sweep(later)).toMatchObject({ examined: 1, waiting: 1 })
    const held = await Payout.findById(id).lean()
    expect(held).toMatchObject({ status: 'processing', needsReconciliation: true, reconcileAttempts: 1 })
    // Backed off: a sweep a minute later leaves the provider alone.
    expect((await sweep(new Date(later.getTime() + 60_000))).examined).toBe(0)
    expect(verify).toHaveBeenCalledTimes(1)

    verify.mockResolvedValue({ status: 'paid', providerRef: 'SIM-TRF-SWEPT', amount: 50 })
    expect(await sweep(new Date(held!.nextReconcileAt!.getTime() + 1000))).toMatchObject({ examined: 1, settled: 1 })
    const settled = await Payout.findById(id).lean()
    expect(settled).toMatchObject({ status: 'paid', refunded: false })
    expect(settled?.needsReconciliation).toBeUndefined()
    expect(await balance()).toBe(afterRequest)
  })

  it('the sweep does nothing while neither rent collection nor the wallet is enabled', async () => {
    const id = await request()
    vi.spyOn(simulatedPayoutProvider, 'sendTransfer').mockRejectedValueOnce(new TypeError('fetch failed'))
    expect((await act(id, 'approve')).status).toBe(504)
    const verify = vi.spyOn(simulatedPayoutProvider, 'verifyTransfer')
    reloadRegulatedFeatures({ NODE_ENV: 'test', REGULATED_FEATURES: 'lending' })
    try {
      expect((await sweep(new Date(Date.now() + 60 * 60_000))).examined).toBe(0)
      expect(verify).not.toHaveBeenCalled()
    } finally {
      reloadRegulatedFeatures()
    }
    // Leave nothing held behind.
    verify.mockResolvedValueOnce({ status: 'failed', failureReason: 'fixture', amount: 50 })
    expect((await act(id, 'reconcile')).status).toBe(200)
  })
})

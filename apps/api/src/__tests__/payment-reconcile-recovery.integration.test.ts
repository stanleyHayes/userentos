import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../services/notify.js', () => ({ notify: vi.fn().mockResolvedValue(undefined), notifyPaymentConfirmed: vi.fn(), notifyPaymentReceived: vi.fn() }))
vi.mock('../services/achievements.js', () => ({ checkAndAward: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../services/webhooks.js', () => ({ dispatchWebhook: vi.fn() }))
const audit = vi.hoisted(() => ({ create: vi.fn().mockResolvedValue({}) }))
vi.mock('../models/AuditLog.js', () => ({ AuditLog: audit }))

/*
 * A stand-in for Paystack's GET /transaction/verify/:reference, so the real
 * adapter — including its "not found" versus outage handling — is exercised.
 */
const answers = new Map<string, { status: number; body: unknown }>()
const verifyCalls: string[] = []
const fakePaystack = express()
fakePaystack.get('/transaction/verify/:reference', (req, res) => {
  verifyCalls.push(req.params.reference)
  const answer = answers.get(req.params.reference) ?? { status: 400, body: { status: false, message: 'Transaction reference not found' } }
  res.status(answer.status).json(answer.body)
})
const fakeServer = await new Promise<Server>((resolve) => { const listener = fakePaystack.listen(0, '127.0.0.1', () => resolve(listener)) })
process.env.PAYSTACK_BASE_URL = `http://127.0.0.1:${(fakeServer.address() as AddressInfo).port}`
process.env.PAYSTACK_SECRET_KEY = 'sk_test_reconcile'

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { Payment } = await import('../models/Payment.js')
const { Wallet } = await import('../models/Wallet.js')
const { WalletCredit } = await import('../models/WalletCredit.js')
const { MarketplaceTransaction } = await import('../models/MarketplaceTransaction.js')
const { reconcileStalePayments, NOT_REACHED_FAIL_AFTER_MS } = await import('../services/payments/reconcilePayments.js')
const { applyDisputeEvent } = await import('../services/payments/refunds.js')
const { default: adminPaymentRoutes } = await import('../routes/adminPayments.js')

describe.skipIf(!hasTestMongo)('stuck payment recovery', () => {
  const tenantId = String(new mongoose.Types.ObjectId())
  const admin = new mongoose.Types.ObjectId(), outsider = new mongoose.Types.ObjectId()
  const tag = tenantId.slice(-8)
  const landlords: string[] = []
  const scope = { tenantId }
  let server: Server, base = ''
  let n = 0
  const sweep = (now?: Date) => reconcileStalePayments({ now, scope })
  const paid = (reference: string, amount = 10000, status = 'success') => answers.set(reference, { status: 200, body: { status: true, data: { reference, status, amount, currency: 'GHS', paid_at: new Date(Date.now() - 60_000).toISOString() } } })

  async function payment(fields: Record<string, unknown> = {}, ageMs = 5 * 60_000) {
    const landlordId = String(new mongoose.Types.ObjectId()); landlords.push(landlordId)
    const p = await Payment.create({ tenantId, landlordId, agreementId: `agreement-${tag}`, purpose: 'rent', amount: 100, method: 'mtn_momo', reference: `PAY-${tag}-${++n}`, collectionSource: 'paystack', status: 'processing', ...fields })
    // Backdate: the sweep only looks at payments old enough to have missed a webhook.
    await Payment.collection.updateOne({ _id: p._id }, { $set: { createdAt: new Date(Date.now() - ageMs) } })
    return p
  }
  const auth = (id: mongoose.Types.ObjectId, roles: string[], permissions: string[] = []) => ({ Authorization: `Bearer ${jwt.sign({ userId: String(id), roles, permissions, purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`, 'Content-Type': 'application/json' })

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await Promise.all([Payment.init(), Wallet.init(), WalletCredit.init()])
    await User.create([admin, outsider].map((_id, i) => ({
      _id, email: `recover-${i}-${_id}@rentos.test`, phone: '0241234567', firstName: 'Rec', lastName: 'Fixture', passwordHash: 'fixture-only',
      roles: [i ? 'tenant' : 'admin'], activeRole: i ? 'tenant' : 'admin',
    })))
    const app = express(); app.use(express.json()); app.use('/admin/payments', adminPaymentRoutes)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/admin/payments`
  })
  beforeEach(async () => { answers.clear(); verifyCalls.length = 0; audit.create.mockClear(); await Payment.deleteMany({ tenantId }) })
  afterAll(async () => {
    await new Promise<void>((resolve) => fakeServer.close(() => resolve()))
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Payment.deleteMany({ tenantId })
    await MarketplaceTransaction.deleteMany({ buyerId: tenantId })
    await Wallet.deleteMany({ userId: { $in: landlords } })
    await WalletCredit.deleteMany({ userId: { $in: landlords } })
    await User.deleteMany({ _id: { $in: [admin, outsider] } })
    await mongoose.disconnect()
  })

  it('recovers an interrupted Paystack initiation that never recorded a provider reference, crediting once', async () => {
    const p = await payment({ collectionInitiationUncertainAt: new Date() })
    expect(p.providerRef).toBeUndefined()
    paid(p.reference)
    await Promise.all([sweep(), sweep(), sweep()])
    expect((await Payment.findById(p._id).lean())?.status).toBe('completed')
    expect(await WalletCredit.countDocuments({ operationKey: `payment-credit:v1:${p._id}` })).toBe(1)
    expect((await Wallet.findOne({ userId: p.landlordId }).lean())?.balance).toBe(100)
    // Asked once: the concurrent sweeps claimed it before calling the provider.
    expect(verifyCalls.filter((r) => r === p.reference)).toHaveLength(1)
  })

  it('believes "no such charge" only after 30 minutes, then fails the payment and frees the rent period', async () => {
    const young = await payment({ openCollectionKey: `rent:young-${tag}` }, 10 * 60_000)
    const old = await payment({ openCollectionKey: `rent:old-${tag}` }, NOT_REACHED_FAIL_AFTER_MS + 60_000)
    await sweep()
    expect((await Payment.findById(young._id).lean())?.status).toBe('processing')
    const failed = await Payment.findById(old._id).lean()
    expect(failed).toMatchObject({ status: 'failed', failureReason: 'never_reached_provider' })
    expect(failed?.openCollectionKey).toBeUndefined()
  })

  it('treats Paystack "abandoned" as final only after 30 minutes', async () => {
    const young = await payment({}, 10 * 60_000)
    const old = await payment({}, NOT_REACHED_FAIL_AFTER_MS + 60_000)
    paid(young.reference, 10000, 'abandoned')
    paid(old.reference, 10000, 'abandoned')
    await sweep()
    expect((await Payment.findById(young._id).lean())?.status).toBe('processing')
    expect((await Payment.findById(old._id).lean())?.status).toBe('failed')
  })

  it('leaves a payment alone during an outage and backs off before asking again', async () => {
    const p = await payment()
    answers.set(p.reference, { status: 502, body: { status: false, message: 'Bad gateway' } })
    expect(await sweep()).toMatchObject({ examined: 1, settled: 0, failed: 0 })
    expect(await Payment.findById(p._id).lean()).toMatchObject({ status: 'processing', providerCheckAttempts: 1 })
    expect((await sweep()).examined).toBe(0)
    // Due again after the backoff.
    const due = (await Payment.findById(p._id).lean())!.nextProviderCheckAt!
    expect((await sweep(new Date(due.getTime() + 1000))).examined).toBe(1)
  })

  it('never sweeps a failed payment, but an admin recheck finds a late success and completes it once', async () => {
    const p = await payment({ status: 'failed', failureReason: 'timeout' }, 60 * 60_000)
    paid(p.reference)
    expect((await sweep()).examined).toBe(0)
    const recheck = () => fetch(`${base}/${String(p._id)}/resolve`, { method: 'POST', headers: auth(admin, ['admin'], ['payments:process']), body: JSON.stringify({ action: 'recheck' }) })
    expect((await recheck()).status).toBe(200)
    expect(await Payment.findById(p._id).lean()).toMatchObject({ status: 'completed', lateSuccessAt: expect.any(Date) })
    expect(await WalletCredit.countDocuments({ operationKey: `payment-credit:v1:${p._id}` })).toBe(1)
    expect(audit.create.mock.calls.filter(([entry]) => (entry as { action: string }).action === 'alert.payment_late_success')).toHaveLength(1)
    // Completed now: a second recheck changes nothing.
    expect((await recheck()).status).toBe(409)
  })

  describe('admin attention queue', () => {
    it('is limited to staff who process payments', async () => {
      expect((await fetch(`${base}/attention`, { headers: auth(outsider, ['tenant']) })).status).toBe(403)
    })

    it('lists held and uncertain payments and flagged refunds, and resolves them', async () => {
      const held = await payment({ failureReason: 'amount_mismatch: provider reported 50, expected 100', openCollectionKey: `rent:held-${tag}` })
      const recovery = await payment({ status: 'refunded', refundRecovery: 'required', refundRecoveryAmount: 100 })
      const clean = await payment({ status: 'completed' })
      const list = await fetch(`${base}/attention`, { headers: auth(admin, ['admin'], ['payments:process']) })
      expect(list.status).toBe(200)
      const items = (await list.json()).data.items as Array<{ id: string; attention: string[] }>
      expect(items.find((i) => i.id === String(held._id))?.attention).toEqual(expect.arrayContaining(['held']))
      expect(items.find((i) => i.id === String(recovery._id))?.attention).toEqual(['refund_recovery'])
      expect(items.find((i) => i.id === String(clean._id))).toBeUndefined()

      // Held for a mismatch: an admin fails it (after refunding by hand), freeing the rent period.
      const resolve = (paymentId: unknown, body: unknown) => fetch(`${base}/${String(paymentId)}/resolve`, { method: 'POST', headers: auth(admin, ['admin'], ['payments:process']), body: JSON.stringify(body) })
      expect((await resolve(held._id, { action: 'mark_failed' })).status).toBe(400)
      expect((await resolve(held._id, { action: 'mark_failed', note: 'Refunded the GHS 50 through Paystack' })).status).toBe(200)
      const failed = await Payment.findById(held._id).lean()
      expect(failed).toMatchObject({ status: 'failed', resolvedBy: String(admin), resolutionNote: 'Refunded the GHS 50 through Paystack' })
      expect(failed?.openCollectionKey).toBeUndefined()
      expect((await resolve(held._id, { action: 'mark_failed', note: 'again' })).status).toBe(409)

      expect((await resolve(recovery._id, { action: 'recovery_resolved', note: 'Landlord repaid by transfer' })).status).toBe(200)
      expect((await Payment.findById(recovery._id).lean())?.refundRecovery).toBe('resolved')
    })

    const asAdmin = () => auth(admin, ['admin'], ['payments:process'])
    const resolve = (id: unknown, body: unknown) => fetch(`${base}/${String(id)}/resolve`, { method: 'POST', headers: asAdmin(), body: JSON.stringify(body) })
    const attention = async (kind: string) => (await (await fetch(`${base}/attention?kind=${kind}`, { headers: asAdmin() })).json()).data as { items: Array<{ id: string; attention: string[] }>; orders: Array<{ id: string; attention: string[] }> }

    it('lists a late success on a payment an admin had already marked failed, until it is acknowledged', async () => {
      const p = await payment({ failureReason: 'amount_mismatch: provider reported 50, expected 100' })
      expect((await resolve(p._id, { action: 'mark_failed', note: 'Customer says they never paid' })).status).toBe(200)
      // Then the full amount turns up after all.
      paid(p.reference)
      expect((await resolve(p._id, { action: 'recheck' })).status).toBe(200)
      expect(await Payment.findById(p._id).lean()).toMatchObject({ status: 'completed', lateSuccessAt: expect.any(Date), resolvedAt: expect.any(Date) })
      expect((await attention('late_success')).items.find((i) => i.id === String(p._id))?.attention).toEqual(['late_success'])

      expect((await resolve(p._id, { action: 'acknowledge_late_success', note: 'Landlord credited; no second payment' })).status).toBe(200)
      expect((await attention('late_success')).items.find((i) => i.id === String(p._id))).toBeUndefined()
      expect((await resolve(p._id, { action: 'acknowledge_late_success', note: 'again' })).status).toBe(409)
    })

    it('an acknowledged chargeback leaves the queue until a new one opens', async () => {
      const p = await payment({ status: 'completed' })
      await applyDisputeEvent({ event: 'charge.dispute.create', data: { transaction: { reference: p.reference } } })
      expect((await attention('disputed')).items.find((i) => i.id === String(p._id))?.attention).toEqual(['disputed'])
      // Acknowledging a late success that does not exist changes nothing.
      expect((await resolve(p._id, { action: 'acknowledge_late_success', note: 'wrong flag' })).status).toBe(409)
      expect((await resolve(p._id, { action: 'acknowledge_dispute', note: 'Evidence sent to Paystack' })).status).toBe(200)
      expect((await attention('disputed')).items.find((i) => i.id === String(p._id))).toBeUndefined()
      expect((await Payment.findById(p._id).lean())?.disputeStatus).toBe('open')

      await applyDisputeEvent({ event: 'charge.dispute.resolve', data: { resolution: 'merchant-accepted', transaction: { reference: p.reference } } })
      await applyDisputeEvent({ event: 'charge.dispute.create', data: { transaction: { reference: p.reference } } })
      expect((await attention('disputed')).items.find((i) => i.id === String(p._id))?.attention).toEqual(['disputed'])
    })

    it('resolves marketplace orders: a duplicate-charge refund, a chargeback and a late success', async () => {
      const order = (fields: Record<string, unknown>) => MarketplaceTransaction.create({ reference: `MKT-${tag}-${++n}`, buyerId: tenantId, buyerEmail: 'b@rentos.test', sellerId: `seller-${tag}`, purpose: 'service_booking', grossAmount: 100, platformFeePercent: 5, platformFeeAmount: 5, sellerExpectedAmount: 95, status: 'paid', providerBound: true, ...fields })
      const duplicate = await order({ refundStatus: 'required', duplicateOf: `MKT-${tag}-first`, refundReason: 'Order already paid' })
      const unneeded = await order({ refundStatus: 'required', refundReason: 'Booking was no longer awaiting payment' })
      const chargeback = await order({ status: 'disputed', disputedAt: new Date() })
      const late = await order({ lateSuccessAt: new Date() })
      expect((await attention('refund_required')).orders.find((o) => o.id === String(duplicate._id))?.attention).toEqual(['refund_required'])
      expect((await attention('disputed')).orders.find((o) => o.id === String(chargeback._id))?.attention).toEqual(['disputed'])
      expect((await attention('late_success')).orders.find((o) => o.id === String(late._id))?.attention).toEqual(['late_success'])

      const issued = await resolve(duplicate._id, { action: 'refund_issued', note: 'Refunded through the Paystack dashboard', type: 'order' })
      expect(issued.status).toBe(200)
      expect(await MarketplaceTransaction.findById(duplicate._id).lean()).toMatchObject({ refundStatus: 'refunded', resolvedBy: String(admin), resolutionNote: 'Refunded through the Paystack dashboard' })
      // An order id alone is found too.
      expect((await resolve(unneeded._id, { action: 'refund_waived', note: 'Buyer asked to keep it as credit' })).status).toBe(200)
      expect((await MarketplaceTransaction.findById(unneeded._id).lean())?.refundStatus).toBe('waived')
      expect((await resolve(duplicate._id, { action: 'refund_issued', note: 'again', type: 'order' })).status).toBe(409)

      expect((await resolve(chargeback._id, { action: 'acknowledge_dispute', note: 'Evidence sent', type: 'order' })).status).toBe(200)
      expect((await attention('disputed')).orders.find((o) => o.id === String(chargeback._id))).toBeUndefined()
      expect((await resolve(late._id, { action: 'acknowledge_late_success', note: 'Order was unpaid; nothing to refund' })).status).toBe(200)
      expect((await attention('late_success')).orders.find((o) => o.id === String(late._id))).toBeUndefined()

      // Payment-only actions, and the wrong type, are refused.
      expect((await resolve(late._id, { action: 'mark_failed', note: 'not for orders' })).status).toBe(400)
      const p = await payment({ status: 'completed' })
      expect((await resolve(p._id, { action: 'refund_issued', note: 'wrong collection', type: 'order' })).status).toBe(404)
    })

    it('rechecks a payment with the provider through the sweep\'s own path', async () => {
      const p = await payment()
      paid(p.reference)
      const res = await fetch(`${base}/${String(p._id)}/resolve`, { method: 'POST', headers: auth(admin, ['admin'], ['payments:process']), body: JSON.stringify({ action: 'recheck' }) })
      expect(res.status).toBe(200)
      expect((await res.json()).data).toMatchObject({ outcome: 'settled', payment: expect.objectContaining({ status: 'completed' }) })
    })
  })
})

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
vi.mock('../models/AuditLog.js', () => ({ AuditLog: { create: vi.fn().mockResolvedValue({}) } }))
// Count provider initiations without replacing the simulated rail.
const calls = vi.hoisted(() => ({ collections: [] as unknown[] }))
vi.mock('../services/payments/index.js', async (orig) => {
  const actual = await orig() as typeof import('../services/payments/index.js')
  return {
    ...actual,
    getProvider: (...args: Parameters<typeof actual.getProvider>) => {
      const real = actual.getProvider(...args)
      return Object.assign(Object.create(Object.getPrototypeOf(real)), real, {
        initiateCollection: (input: Parameters<typeof real.initiateCollection>[0]) => { calls.collections.push(input); return real.initiateCollection(input) },
      })
    },
  }
})
const provider = vi.hoisted(() => ({ initialized: [] as unknown[] }))
vi.mock('../services/marketplace/paystack.js', async (orig) => ({
  ...(await orig() as Record<string, unknown>),
  initializeSplitTransaction: vi.fn(async (input: { reference: string }) => {
    provider.initialized.push(input)
    await new Promise((resolve) => setTimeout(resolve, 20))
    return { authorizationUrl: `https://checkout.test/${input.reference}`, accessCode: `ACCESS-${input.reference}`, reference: input.reference }
  }),
}))

process.env.PAYMENTS_PROVIDER_MODE = 'simulated'
const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { Agreement } = await import('../models/Agreement.js')
const { Payment } = await import('../models/Payment.js')
const { MarketplaceTransaction } = await import('../models/MarketplaceTransaction.js')
const { ServiceBooking } = await import('../models/ServiceBooking.js')
const { PaymentAccount } = await import('../models/PaymentAccount.js')
const { finalizePayment } = await import('../services/payments/finalize.js')
const { applySuccessfulCharge, BINDING_KEY } = await import('../services/marketplace/settle.js')
const { activatePaidSubscription } = await import('../services/payments/paidSubscription.js')
const { default: paymentsRouter } = await import('../routes/payments.js')
const { default: marketplaceRouter } = await import('../routes/marketplacePayments.js')

describe.skipIf(!hasTestMongo)('one in-flight collection per obligation', () => {
  const tenant = new mongoose.Types.ObjectId(), landlord = new mongoose.Types.ObjectId(), seller = new mongoose.Types.ObjectId()
  const userIds = [tenant, landlord, seller]
  const tag = String(tenant).slice(-8)
  let server: Server, base = '', agreementId = ''
  const auth = (id: mongoose.Types.ObjectId, roles: string[]) => `Bearer ${jwt.sign({ userId: String(id), email: `dup-${id}@rentos.test`, roles, permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`
  const pay = (key: string | undefined, period = { startDate: '2026-09-01', endDate: '2026-09-30' }) => fetch(`${base}/payments`, {
    method: 'POST',
    headers: { Authorization: auth(tenant, ['tenant']), 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
    body: JSON.stringify({ agreementId, rentPeriod: period, method: 'mtn_momo', phone: '0241234567' }),
  })

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await Promise.all([Payment.init(), MarketplaceTransaction.init()])
    await User.create(userIds.map((_id, i) => ({
      _id, email: `dup-${_id}@rentos.test`, phone: '0241234567', firstName: 'Dup', lastName: 'Fixture', passwordHash: 'fixture-only',
      roles: [['tenant', 'landlord', 'tenant'][i]], activeRole: ['tenant', 'landlord', 'tenant'][i],
    })))
    const agreement = await Agreement.create({
      propertyId: `prop-${tag}`, landlordId: String(landlord), tenantId: String(tenant), status: 'active',
      startDate: '2026-01-01', endDate: '2026-12-31', rentAmount: 1000, advanceMonths: 1, tenantSignature: '2026-01-01', landlordSignature: '2026-01-01',
    })
    agreementId = String(agreement._id)
    await PaymentAccount.create({ ownerId: String(seller), businessName: 'Fixture Works', bankCode: 'MTN', bankName: 'MTN', accountNumberMasked: '••••4567', subaccountCode: `ACCT_${tag}`, status: 'ready', readyToReceivePayments: true })
    const app = express(); app.use(express.json())
    app.use('/payments', paymentsRouter)
    app.use('/marketplace', marketplaceRouter)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  beforeEach(() => { calls.collections = []; provider.initialized = [] })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Payment.deleteMany({ tenantId: String(tenant) })
    await MarketplaceTransaction.deleteMany({ buyerId: String(tenant) })
    await ServiceBooking.deleteMany({ requesterId: String(tenant) })
    await PaymentAccount.deleteOne({ ownerId: String(seller) })
    await Agreement.deleteOne({ _id: agreementId })
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.disconnect()
  })

  describe('rent', () => {
    it('refuses a checkout without an Idempotency-Key', async () => {
      const res = await pay(undefined)
      expect(res.status).toBe(428)
      expect(calls.collections).toHaveLength(0)
    })

    it('eight parallel checkouts for one rent period, with different keys, open one payment and one provider call', async () => {
      const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => pay(`device-${tag}-${i}`)))
      const bodies = await Promise.all(responses.map((r) => r.json()))
      const created = responses.filter((r) => r.status === 201)
      expect(created).toHaveLength(1)
      expect(responses.filter((r) => r.status === 409)).toHaveLength(7)
      const id = bodies[responses.findIndex((r) => r.status === 201)].data.payment.id
      // Every refused checkout is told which payment is already under way.
      for (const body of bodies.filter((b) => !b.success)) {
        expect(body.code).toBe('PAYMENT_IN_PROGRESS')
        expect(body.data.payment.id).toBe(id)
      }
      expect(await Payment.countDocuments({ tenantId: String(tenant), agreementId })).toBe(1)
      expect(calls.collections).toHaveLength(1)

      // The correlator was saved before the provider was called.
      const saved = await Payment.findById(id).lean()
      expect(saved?.providerRef).toMatch(/^SIM-/)
      expect(calls.collections[0]).toMatchObject({ providerRef: saved?.providerRef })

      // A retry with the winner's own key replays it rather than refusing.
      const replay = await pay(saved!.idempotencyKey)
      expect(replay.status).toBe(200)
      expect((await replay.json()).data.payment.id).toBe(id)

      // Once it fails, the period is free for a new checkout.
      await finalizePayment({ reference: saved!.reference, providerRef: saved!.providerRef!, status: 'failed', amount: 0, timestamp: new Date().toISOString(), raw: { reason: 'declined' } }, { source: 'webhook', providerSource: 'simulated' })
      expect((await Payment.findById(id).lean())?.openCollectionKey).toBeUndefined()
      expect((await pay(`device-${tag}-after-failure`)).status).toBe(201)
      expect(await Payment.countDocuments({ tenantId: String(tenant), agreementId })).toBe(2)
    })

    it('another rent period is a separate obligation', async () => {
      expect((await pay(`device-${tag}-october`, { startDate: '2026-10-01', endDate: '2026-10-31' })).status).toBe(201)
    })
  })

  describe('marketplace', () => {
    let bookingId = ''
    beforeEach(async () => {
      await MarketplaceTransaction.deleteMany({ buyerId: String(tenant) })
      await ServiceBooking.deleteMany({ requesterId: String(tenant) })
      const booking = await ServiceBooking.create({ requesterId: String(tenant), requesterRole: 'tenant', workerId: `worker-${tag}`, workerUserId: String(seller), description: 'Fix the gate', status: 'completed', quoteProvided: true, quoteAmount: 100, quoteAccepted: true })
      bookingId = String(booking._id)
    })
    const initialize = (key?: string, headerKey?: string) => fetch(`${base}/marketplace/initialize`, {
      method: 'POST',
      headers: { Authorization: auth(tenant, ['tenant']), 'Content-Type': 'application/json', ...(headerKey ? { 'Idempotency-Key': headerKey } : {}) },
      body: JSON.stringify({ purpose: 'service_booking', bookingId, email: 'buyer@rentos.test', ...(key ? { idempotencyKey: key } : {}) }),
    })

    it('refuses to initialize without an idempotency key, and accepts one as a header', async () => {
      expect((await initialize()).status).toBe(428)
      expect((await initialize(undefined, `header-key-${tag}`)).status).toBe(201)
    })

    it('five parallel initializations for one booking open one checkout, and the rest resume it', async () => {
      const responses = await Promise.all(Array.from({ length: 5 }, (_, i) => initialize(`booking-key-${tag}-${i}`)))
      expect(responses.filter((r) => r.status === 201)).toHaveLength(1)
      expect(responses.filter((r) => r.status === 409)).toHaveLength(4)
      expect(await MarketplaceTransaction.countDocuments({ bookingId })).toBe(1)
      expect(provider.initialized).toHaveLength(1)
      const open = await MarketplaceTransaction.findOne({ bookingId }).lean()
      expect(open?.openOrderKey).toBe(`booking:${bookingId}`)
    })

    it('flags a second verified charge for an already-paid booking for refund review, leaving the order as first paid', async () => {
      const first = await MarketplaceTransaction.create({ reference: `MKT-${tag}-FIRST`, buyerId: String(tenant), buyerEmail: 'b@rentos.test', sellerId: String(seller), bookingId, purpose: 'service_booking', grossAmount: 100, platformFeePercent: 5, platformFeeAmount: 5, sellerExpectedAmount: 95, status: 'pending', providerBound: true })
      const second = await MarketplaceTransaction.create({ reference: `MKT-${tag}-SECOND`, buyerId: String(tenant), buyerEmail: 'b@rentos.test', sellerId: String(seller), bookingId, purpose: 'service_booking', grossAmount: 100, platformFeePercent: 5, platformFeeAmount: 5, sellerExpectedAmount: 95, status: 'pending', providerBound: true })
      const verified = (t: { _id: unknown; reference: string }) => ({ status: 'success', amount: 100, currency: 'GHS', reference: t.reference, metadata: { [BINDING_KEY]: String(t._id) } })
      expect(await applySuccessfulCharge(first, verified(first), 'webhook')).toEqual({ applied: true })
      await ServiceBooking.updateOne({ _id: bookingId }, { $set: { paymentAmount: 100 } })
      expect(await applySuccessfulCharge(second, verified(second), 'webhook')).toEqual({ applied: true })

      const flagged = await MarketplaceTransaction.findById(second._id).lean()
      expect(flagged).toMatchObject({ status: 'paid', refundStatus: 'required', duplicateOf: first.reference })
      expect((await MarketplaceTransaction.findById(first._id).lean())?.refundStatus).toBeUndefined()
      expect(await ServiceBooking.findById(bookingId).lean()).toMatchObject({ paymentStatus: 'paid', paymentAmount: 100 })
    })
  })

  it('flags a superseded subscription payment for refund review', async () => {
    const terms = { version: 1, capturedAt: new Date(), packageId: String(new mongoose.Types.ObjectId()), packageVersion: 1, packageName: 'Pro', amount: 99, currency: 'GHS', billingCycle: 'monthly' as const, benefits: [] as string[], featuresJson: '{}' }
    const landlordUser = String(landlord)
    const older = await Payment.create({ tenantId: landlordUser, amount: 99, purpose: 'subscription', status: 'completed', method: 'bank_transfer', reference: `SUB-${tag}-OLD`, paidAt: new Date(Date.now() - 120_000).toISOString(), subscriptionTerms: terms })
    const newer = await Payment.create({ tenantId: landlordUser, amount: 99, purpose: 'subscription', status: 'completed', method: 'bank_transfer', reference: `SUB-${tag}-NEW`, paidAt: new Date(Date.now() - 60_000).toISOString(), subscriptionTerms: terms })
    try {
      expect(await activatePaidSubscription(String(newer._id))).toBe(true)
      expect(await activatePaidSubscription(String(older._id))).toBe(true)
      expect(await Payment.findById(older._id).lean()).toMatchObject({ subscriptionActivationResult: 'superseded', refundStatus: 'required' })
      expect((await Payment.findById(newer._id).lean())?.refundStatus).toBeUndefined()
    } finally {
      await Payment.deleteMany({ _id: { $in: [older._id, newer._id] } })
    }
  })
})

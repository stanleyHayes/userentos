import mongoose from 'mongoose'
import express from 'express'
import { createHmac } from 'node:crypto'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../services/notify.js', () => ({ notify: vi.fn().mockResolvedValue(undefined), notifyPaymentConfirmed: vi.fn(), notifyPaymentReceived: vi.fn() }))
vi.mock('../services/achievements.js', () => ({ checkAndAward: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../services/webhooks.js', () => ({ dispatchWebhook: vi.fn() }))
const audit = vi.hoisted(() => ({ create: vi.fn().mockResolvedValue({}) }))
vi.mock('../models/AuditLog.js', () => ({ AuditLog: audit }))
const paystack = vi.hoisted(() => ({ verifyTransaction: vi.fn() }))
vi.mock('../services/marketplace/paystack.js', async (orig) => ({ ...(await orig() as Record<string, unknown>), verifyTransaction: paystack.verifyTransaction }))
// Lets a test make the payment finalizer throw once, like a dropped database connection.
const faults = vi.hoisted(() => ({ finalizeThrows: 0 }))
vi.mock('../services/payments/finalize.js', async (orig) => {
  const actual = await orig() as typeof import('../services/payments/finalize.js')
  return {
    ...actual,
    finalizePayment: vi.fn(async (...args: Parameters<typeof actual.finalizePayment>) => {
      if (faults.finalizeThrows > 0) { faults.finalizeThrows--; throw new Error('database unavailable') }
      return actual.finalizePayment(...args)
    }),
  }
})

const SECRET = 'sk_test_dispatch'
process.env.PAYSTACK_SECRET_KEY = SECRET
const { Payment } = await import('../models/Payment.js')
const { Payout } = await import('../models/Payout.js')
const { Wallet } = await import('../models/Wallet.js')
const { WalletCredit } = await import('../models/WalletCredit.js')
const { WebhookEvent } = await import('../models/WebhookEvent.js')
const { MarketplaceTransaction } = await import('../models/MarketplaceTransaction.js')
const { ServiceBooking } = await import('../models/ServiceBooking.js')
const { Sponsorship } = await import('../models/Sponsorship.js')
const { AffiliateCommission } = await import('../models/Affiliate.js')
const { BINDING_KEY } = await import('../services/marketplace/settle.js')
const { retryUnprocessedWebhooks, paystackEventId } = await import('../services/payments/paystackEvents.js')
const { parseRefundEvent } = await import('../services/payments/refunds.js')
const { default: paystackRoutes } = await import('../routes/paystackWebhooks.js')
const { default: marketplaceRoutes } = await import('../routes/marketplaceWebhooks.js')
const { default: payoutRoutes } = await import('../routes/payoutWebhooks.js')

it('parses the documented Paystack refund payload: the charge is named by transaction_reference, in pesewas', () => {
  expect(parseRefundEvent({ event: 'refund.processed', data: { id: 3018284, status: 'processed', transaction_reference: 'MKT-123', amount: 5000, currency: 'GHS' } }))
    .toEqual({ transactionReference: 'MKT-123', refundId: '3018284', amount: 50, currency: 'GHS' })
  expect(parseRefundEvent({ event: 'refund.processed', data: { transaction: { reference: 'PAY-9' }, amount: 100 } })).toMatchObject({ transactionReference: 'PAY-9', amount: 1 })
  expect(parseRefundEvent({ event: 'refund.processed', data: { transaction_reference: 'X', amount: -5 } }).amount).toBeNaN()
})

it('keys a refund event on the refund, never on the charge every partial refund of it shares', () => {
  const refund = (data: Record<string, unknown>) => { const body = { event: 'refund.processed', data }; return paystackEventId(body, JSON.stringify(body)) }
  expect(refund({ id: 77, transaction_reference: 'MKT-1' })).toBe('refund.processed:77')
  expect(refund({ refund_reference: 'RF-1', transaction_reference: 'MKT-1', amount: 100 })).toBe('refund.processed:RF-1')
  expect(refund({ refund_reference: 'RF-2', transaction_reference: 'MKT-1', amount: 100 })).toBe('refund.processed:RF-2')
  // Neither id: the body's own hash, so two different refunds still differ.
  const [a, b] = [refund({ transaction_reference: 'MKT-1', amount: 100 }), refund({ transaction_reference: 'MKT-1', amount: 200 })]
  expect(a).toMatch(/^refund\.processed:sha256:[0-9a-f]{64}$/)
  expect(a).not.toBe(b)
  // Other families keep their own ids.
  expect(paystackEventId({ event: 'charge.success', data: { reference: 'PAY-1' } }, '{}')).toBe('charge.success:PAY-1')
})

describe.skipIf(!hasTestMongo)('the one Paystack webhook', () => {
  const tag = String(new mongoose.Types.ObjectId()).slice(-10)
  const users: string[] = []
  let server: Server, base = ''
  let n = 0
  const id = () => String(new mongoose.Types.ObjectId())
  const sign = (body: string) => createHmac('sha512', SECRET).update(body, 'utf8').digest('hex')
  const deliver = (event: unknown, path = '/api/webhooks/paystack') => {
    const body = JSON.stringify(event)
    return fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-paystack-signature': sign(body) }, body })
  }
  const balance = async (userId: string) => (await Wallet.findOne({ userId }).lean())?.balance
  const alerts = (code: string) => audit.create.mock.calls.filter(([entry]) => (entry as { action: string }).action === `alert.${code}`)

  async function rentPayment(fields: Record<string, unknown> = {}) {
    const tenantId = id(), landlordId = id(); users.push(tenantId, landlordId)
    const reference = `PAY-${tag}-${++n}`
    return Payment.create({ tenantId, landlordId, agreementId: `agreement-${tag}`, purpose: 'rent', amount: 100, method: 'mtn_momo', reference, providerRef: reference, collectionSource: 'paystack', status: 'pending', ...fields })
  }
  const chargeSuccess = (reference: string, amount = 10000, chargeId: string | number = `${reference}-charge`) => ({
    event: 'charge.success', data: { id: chargeId, reference, amount, currency: 'GHS', status: 'success', paid_at: new Date(Date.now() - 1000).toISOString() },
  })
  async function processingPayout() {
    const userId = id(); users.push(userId)
    const reference = `PO-${tag}-${++n}`
    return Payout.create({ userId, amount: 50, status: 'processing', reference, approvedAt: new Date(), destination: { type: 'mobile_money', accountNumber: '0244000000', bankName: 'MTN', accountName: 'Fixture', recipientCode: 'RCP_1' } })
  }
  async function order(fields: Record<string, unknown> = {}) {
    const buyerId = id(); users.push(buyerId)
    return MarketplaceTransaction.create({
      reference: `MKT-${tag}-${++n}`, buyerId, buyerEmail: 'b@rentos.test', sellerId: `seller-${tag}`, purpose: 'service_booking',
      grossAmount: 100, platformFeePercent: 5, platformFeeAmount: 5, sellerExpectedAmount: 95, status: 'pending', providerBound: true, ...fields,
    })
  }

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await Promise.all([Payment.init(), Payout.init(), Wallet.init(), WalletCredit.init(), WebhookEvent.init(), MarketplaceTransaction.init()])
    const app = express()
    app.use('/api/webhooks/paystack', paystackRoutes)
    app.use('/api/webhooks/marketplace', marketplaceRoutes)
    app.use('/api/webhooks/payouts', payoutRoutes)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  beforeEach(() => { paystack.verifyTransaction.mockReset(); audit.create.mockClear(); faults.finalizeThrows = 0 })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Payment.deleteMany({ reference: { $regex: `^PAY-${tag}-` } })
    await Payout.deleteMany({ reference: { $regex: `^PO-${tag}-` } })
    await MarketplaceTransaction.deleteMany({ reference: { $regex: `^MKT-${tag}-` } })
    await WebhookEvent.deleteMany({ eventId: { $regex: tag } })
    await Wallet.deleteMany({ userId: { $in: users } })
    await WalletCredit.deleteMany({ userId: { $in: users } })
    await ServiceBooking.deleteMany({ requesterId: { $in: users } })
    await Sponsorship.deleteMany({ ownerId: { $in: users } })
    await AffiliateCommission.deleteMany({ sourceRef: { $regex: `^MKT-${tag}-` } })
    await mongoose.disconnect()
  })

  it('refuses an unsigned or malformed event before storing anything', async () => {
    const body = JSON.stringify(chargeSuccess(`PAY-${tag}-unsigned`))
    expect((await fetch(`${base}/api/webhooks/paystack`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })).status).toBe(401)
    expect((await fetch(`${base}/api/webhooks/paystack`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-paystack-signature': sign('not json') }, body: 'not json' })).status).toBe(400)
    expect(await WebhookEvent.countDocuments({ reference: `PAY-${tag}-unsigned` })).toBe(0)
  })

  it.each(['/api/webhooks/paystack', '/api/webhooks/marketplace/paystack', '/api/webhooks/payouts/paystack'])('settles charges AND transfers on %s', async (path) => {
    const payment = await rentPayment()
    const payout = await processingPayout()
    expect((await deliver(chargeSuccess(payment.reference), path)).status).toBe(200)
    expect((await deliver({ event: 'transfer.success', data: { id: `${payout.reference}-trf`, reference: payout.reference, transfer_code: `TRF_${payout.reference}`, amount: 5000 } }, path)).status).toBe(200)

    expect((await Payment.findById(payment._id).lean())?.status).toBe('completed')
    expect(await WalletCredit.countDocuments({ operationKey: `payment-credit:v1:${payment._id}` })).toBe(1)
    expect(await balance(payment.landlordId!)).toBe(100)
    expect((await Payout.findById(payout._id).lean())?.status).toBe('paid')
  })

  it('applies the same event delivered ten times at once exactly once', async () => {
    const payment = await rentPayment()
    const event = chargeSuccess(payment.reference)
    const statuses = (await Promise.all(Array.from({ length: 10 }, () => deliver(event)))).map((r) => r.status)
    expect(statuses.every((s) => s === 200)).toBe(true)
    expect(await WalletCredit.countDocuments({ operationKey: `payment-credit:v1:${payment._id}` })).toBe(1)
    expect(await WebhookEvent.countDocuments({ provider: 'paystack', eventId: `charge.success:${payment.reference}-charge` })).toBe(1)
    expect(await balance(payment.landlordId!)).toBe(100)
  })

  it('answers 500 when processing fails, keeps the event, and the dead-letter sweep finishes it', async () => {
    const payment = await rentPayment()
    faults.finalizeThrows = 1
    expect((await deliver(chargeSuccess(payment.reference))).status).toBe(500)
    const stored = await WebhookEvent.findOne({ eventId: `charge.success:${payment.reference}-charge` }).lean()
    expect(stored?.processedAt).toBeUndefined()
    expect(stored?.processingError).toMatch(/database unavailable/)
    expect((await Payment.findById(payment._id).lean())?.status).toBe('pending')

    expect((await retryUnprocessedWebhooks(50, { reference: payment.reference })).recovered).toBe(1)
    expect((await Payment.findById(payment._id).lean())?.status).toBe('completed')
    expect(await WalletCredit.countDocuments({ operationKey: `payment-credit:v1:${payment._id}` })).toBe(1)
    expect((await WebhookEvent.findOne({ eventId: `charge.success:${payment.reference}-charge` }).lean())?.processedAt).toBeInstanceOf(Date)
  })

  it('acknowledges event families nothing acts on', async () => {
    const res = await deliver({ event: 'subscription.create', data: { id: `sub-${tag}` } })
    expect(res.status).toBe(200)
    expect((await WebhookEvent.findOne({ eventId: `subscription.create:sub-${tag}` }).lean())?.processedAt).toBeInstanceOf(Date)
  })

  describe('a success after the payment was marked failed', () => {
    it('completes it once, credits once, and alerts an admin', async () => {
      const payment = await rentPayment({ status: 'failed', failureReason: 'abandoned' })
      const statuses = (await Promise.all(Array.from({ length: 5 }, (_, i) => deliver(chargeSuccess(payment.reference, 10000, `${payment.reference}-late-${i}`))))).map((r) => r.status)
      expect(statuses.every((s) => s === 200)).toBe(true)
      const saved = await Payment.findById(payment._id).lean()
      expect(saved).toMatchObject({ status: 'completed', lateSuccessAt: expect.any(Date) })
      expect(saved?.failureReason).toBeUndefined()
      expect(await WalletCredit.countDocuments({ operationKey: `payment-credit:v1:${payment._id}` })).toBe(1)
      expect(await balance(payment.landlordId!)).toBe(100)
      expect(alerts('payment_late_success')).toHaveLength(1)
      expect(audit.create.mock.calls.filter(([entry]) => (entry as { action: string }).action === 'payment.late_success')).toHaveLength(1)
    })

    it('stays failed, with an alert, when the late success is for a different amount', async () => {
      const payment = await rentPayment({ status: 'failed' })
      expect((await deliver(chargeSuccess(payment.reference, 5000))).status).toBe(200)
      expect((await Payment.findById(payment._id).lean())?.status).toBe('failed')
      expect(await WalletCredit.countDocuments({ operationKey: `payment-credit:v1:${payment._id}` })).toBe(0)
      expect(alerts('payment_late_success_unverified')).toHaveLength(1)
    })

    it('only records a failure reported for a completed payment', async () => {
      const payment = await rentPayment({ status: 'completed' })
      expect((await deliver({ event: 'charge.failed', data: { id: `${payment.reference}-f`, reference: payment.reference, status: 'failed', amount: 10000, currency: 'GHS' } })).status).toBe(200)
      expect((await Payment.findById(payment._id).lean())?.status).toBe('completed')
      expect(audit.create.mock.calls.some(([entry]) => (entry as { action: string }).action === 'payment.failed_after_completion')).toBe(true)
    })
  })

  describe('marketplace charges', () => {
    it('re-verifies, settles once across duplicate deliveries, and refuses a mismatch with an alert', async () => {
      const t = await order()
      paystack.verifyTransaction.mockResolvedValue({ status: 'success', amount: 100, currency: 'GHS', reference: t.reference, fees: 1.5, metadata: { [BINDING_KEY]: String(t._id) }, raw: {} })
      await Promise.all([deliver(chargeSuccess(t.reference)), deliver(chargeSuccess(t.reference))])
      expect(await MarketplaceTransaction.findById(t._id).lean()).toMatchObject({ status: 'paid', processedEventIds: [`charge.success:${t.reference}-charge`] })

      const mismatched = await order()
      paystack.verifyTransaction.mockResolvedValue({ status: 'success', amount: 10, currency: 'GHS', reference: mismatched.reference, metadata: { [BINDING_KEY]: String(mismatched._id) }, raw: {} })
      expect((await deliver(chargeSuccess(mismatched.reference, 1000))).status).toBe(200)
      expect((await MarketplaceTransaction.findById(mismatched._id).lean())?.status).toBe('pending')
      expect(alerts('marketplace_charge_refused')).toHaveLength(1)
    })

    const verifiedFor = (t: { _id: unknown; reference: string }, amount = 100) => ({ status: 'success', amount, currency: 'GHS', reference: t.reference, fees: 1.5, metadata: { [BINDING_KEY]: String(t._id) }, raw: {} })

    it('a success on a checkout we had closed settles the order once, as a late success', async () => {
      const buyer = id(); users.push(buyer)
      const booking = await ServiceBooking.create({ requesterId: buyer, requesterRole: 'tenant', workerId: `worker-${tag}`, description: 'Fix the tap', status: 'completed', paymentStatus: 'pending' })
      // Closed as abandoned when the buyer started a new checkout; they then paid on the page they still had open.
      const t = await order({ status: 'failed', failureReason: 'abandoned', bookingId: String(booking._id) })
      paystack.verifyTransaction.mockResolvedValue(verifiedFor(t))
      const statuses = (await Promise.all([1, 2, 3].map((i) => deliver(chargeSuccess(t.reference, 10000, `${t.reference}-late-${i}`))))).map((r) => r.status)
      expect(statuses.every((s) => s === 200)).toBe(true)

      const saved = await MarketplaceTransaction.findById(t._id).lean()
      expect(saved).toMatchObject({ status: 'paid', lateSuccessAt: expect.any(Date), settlementStatus: 'pending' })
      expect(saved?.failureReason).toBeUndefined()
      expect(saved?.refundStatus).toBeUndefined()
      expect(await ServiceBooking.findById(booking._id).lean()).toMatchObject({ paymentStatus: 'paid', paymentAmount: 100 })
      expect(alerts('marketplace_late_success')).toHaveLength(1)
    })

    it('a late success for an order another charge already paid is kept for refund, leaving the order alone', async () => {
      const owner = id(); users.push(owner)
      const campaign = await Sponsorship.create({ propertyId: `prop-${tag}`, ownerId: owner, productId: 'featured', placement: 'search', startAt: new Date(), endAt: new Date(Date.now() + 86_400_000), spend: 100, status: 'active' })
      const platform = { sponsorshipId: String(campaign._id), sellerId: undefined, platformFeePercent: 100, platformFeeAmount: 100, sellerExpectedAmount: 0 }
      const first = await order({ ...platform, status: 'paid', verifiedAt: new Date() })
      const late = await order({ ...platform, status: 'failed', failureReason: 'expired' })
      paystack.verifyTransaction.mockResolvedValue(verifiedFor(late))
      expect((await deliver(chargeSuccess(late.reference))).status).toBe(200)

      expect(await MarketplaceTransaction.findById(late._id).lean()).toMatchObject({ status: 'paid', lateSuccessAt: expect.any(Date), refundStatus: 'required', duplicateOf: first.reference })
      expect((await Sponsorship.findById(campaign._id).lean())?.status).toBe('active')
      expect(alerts('marketplace_late_success')).toHaveLength(1)
      expect(alerts('marketplace_duplicate_charge')).toHaveLength(1)
    })

    it('never revives a closed checkout on a charge that is not its own', async () => {
      const t = await order({ status: 'failed', failureReason: 'abandoned' })
      paystack.verifyTransaction.mockResolvedValue({ ...verifiedFor(t), metadata: { purpose: 'wallet_deposit' } })
      expect((await deliver(chargeSuccess(t.reference))).status).toBe(200)
      expect((await MarketplaceTransaction.findById(t._id).lean())?.status).toBe('failed')
      expect(alerts('marketplace_charge_refused')).toHaveLength(1)
    })

    it('closes a failed checkout conditionally, freeing its order', async () => {
      const t = await order({ openOrderKey: `booking:failed-${tag}` })
      expect((await deliver({ event: 'charge.failed', data: { id: `${t.reference}-f`, reference: t.reference, status: 'failed' } })).status).toBe(200)
      const saved = await MarketplaceTransaction.findById(t._id).lean()
      expect(saved).toMatchObject({ status: 'failed', failureReason: 'provider_failed' })
      expect(saved?.openOrderKey).toBeUndefined()
    })
  })

  describe('refunds and chargebacks', () => {
    const refund = (reference: string, amount: number, refundId: string) => ({ event: 'refund.processed', data: { id: refundId, status: 'processed', transaction_reference: reference, amount, currency: 'GHS' } })

    it('a full marketplace refund, delivered five times at once, refunds the order once and unwinds it', async () => {
      const buyer = id(); users.push(buyer)
      const booking = await ServiceBooking.create({ requesterId: buyer, requesterRole: 'tenant', workerId: `worker-${tag}`, description: 'Fix the gate', status: 'completed', paymentStatus: 'paid', paymentAmount: 100 })
      const t = await order({ status: 'paid', bookingId: String(booking._id) })
      await AffiliateCommission.create({ affiliateId: `aff-${tag}`, event: 'transaction', sourceRef: t.reference, ruleSnapshot: { type: 'flat', value: 5 }, amount: 5 })
      const statuses = (await Promise.all(Array.from({ length: 5 }, () => deliver(refund(t.reference, 10000, `${t.reference}-r1`))))).map((r) => r.status)
      expect(statuses.every((s) => s === 200)).toBe(true)
      expect(await MarketplaceTransaction.findById(t._id).lean()).toMatchObject({ status: 'refunded', refundedAmount: 100, refundEventIds: [`refund:${t.reference}-r1`] })
      const refunded = await ServiceBooking.findById(booking._id).lean()
      expect(refunded?.paymentStatus).toBe('refunded')
      // The worker's earnings must not keep counting money that went back.
      expect(refunded?.paymentAmount).toBeUndefined()
      expect((await AffiliateCommission.findOne({ sourceRef: t.reference }).lean())?.status).toBe('reversed')
    })

    it('refunding a flagged duplicate charge leaves the order as its first payment set it', async () => {
      const buyer = id(), owner = id(); users.push(buyer, owner)
      const booking = await ServiceBooking.create({ requesterId: buyer, requesterRole: 'tenant', workerId: `worker-${tag}`, description: 'Paint the wall', status: 'completed', paymentStatus: 'paid', paymentAmount: 100 })
      const firstBooking = await order({ status: 'paid', bookingId: String(booking._id), verifiedAt: new Date() })
      const dupBooking = await order({ status: 'paid', bookingId: String(booking._id), refundStatus: 'required', duplicateOf: firstBooking.reference })
      const campaign = await Sponsorship.create({ propertyId: `prop-${tag}`, ownerId: owner, productId: 'featured', placement: 'search', startAt: new Date(), endAt: new Date(Date.now() + 86_400_000), spend: 100, status: 'active' })
      const platform = { sponsorshipId: String(campaign._id), sellerId: undefined, platformFeePercent: 100, platformFeeAmount: 100, sellerExpectedAmount: 0 }
      const firstCampaign = await order({ ...platform, status: 'paid', verifiedAt: new Date() })
      const dupCampaign = await order({ ...platform, status: 'paid', refundStatus: 'required', duplicateOf: firstCampaign.reference })

      await deliver(refund(dupBooking.reference, 10000, `${dupBooking.reference}-r`))
      await deliver(refund(dupCampaign.reference, 10000, `${dupCampaign.reference}-r`))

      expect(await MarketplaceTransaction.findById(dupBooking._id).lean()).toMatchObject({ status: 'refunded', refundStatus: 'refunded' })
      expect(await MarketplaceTransaction.findById(dupCampaign._id).lean()).toMatchObject({ status: 'refunded', refundStatus: 'refunded' })
      expect(await ServiceBooking.findById(booking._id).lean()).toMatchObject({ paymentStatus: 'paid', paymentAmount: 100 })
      expect((await Sponsorship.findById(campaign._id).lean())?.status).toBe('active')
    })

    it('refunding one charge while another still holds the buyer\'s money for the order leaves the order paid', async () => {
      const buyer = id(); users.push(buyer)
      const booking = await ServiceBooking.create({ requesterId: buyer, requesterRole: 'tenant', workerId: `worker-${tag}`, description: 'Fix the roof', status: 'completed', paymentStatus: 'paid', paymentAmount: 100 })
      // The admin refunded the first charge instead of the flagged second one.
      const first = await order({ status: 'paid', bookingId: String(booking._id), verifiedAt: new Date() })
      await order({ status: 'paid', bookingId: String(booking._id), refundStatus: 'required', duplicateOf: first.reference })
      await deliver(refund(first.reference, 10000, `${first.reference}-r`))
      expect((await MarketplaceTransaction.findById(first._id).lean())?.status).toBe('refunded')
      expect(await ServiceBooking.findById(booking._id).lean()).toMatchObject({ paymentStatus: 'paid', paymentAmount: 100 })
    })

    it('two partial refunds of one charge that carry no refund id are both applied', async () => {
      const t = await order({ status: 'paid' })
      // No data.id: only refund_reference tells them apart.
      const partial = (amount: number, refundReference: string) => ({ event: 'refund.processed', data: { refund_reference: refundReference, status: 'processed', transaction_reference: t.reference, amount, currency: 'GHS' } })
      expect((await deliver(partial(3000, `${t.reference}-RF1`))).status).toBe(200)
      expect((await deliver(partial(7000, `${t.reference}-RF2`))).status).toBe(200)
      expect(await MarketplaceTransaction.findById(t._id).lean()).toMatchObject({ status: 'refunded', refundedAmount: 100, refundEventIds: [`refund:${t.reference}-RF1`, `refund:${t.reference}-RF2`] })
      // And a redelivery of either changes nothing.
      expect((await deliver(partial(7000, `${t.reference}-RF2`))).status).toBe(200)
      expect((await MarketplaceTransaction.findById(t._id).lean())?.refundedAmount).toBe(100)
    })

    it('partial refunds accumulate: partially_refunded, then refunded, and a refunded sponsorship stops serving', async () => {
      const owner = id(); users.push(owner)
      const campaign = await Sponsorship.create({ propertyId: `prop-${tag}`, ownerId: owner, productId: 'featured', placement: 'search', startAt: new Date(), endAt: new Date(Date.now() + 86_400_000), spend: 100, status: 'active' })
      const t = await order({ status: 'paid', sponsorshipId: String(campaign._id), sellerId: undefined, platformFeePercent: 100, platformFeeAmount: 100, sellerExpectedAmount: 0 })
      await deliver(refund(t.reference, 4000, `${t.reference}-p1`))
      expect(await MarketplaceTransaction.findById(t._id).lean()).toMatchObject({ status: 'partially_refunded', refundedAmount: 40 })
      expect((await Sponsorship.findById(campaign._id).lean())?.status).toBe('active')
      await deliver(refund(t.reference, 6000, `${t.reference}-p2`))
      expect(await MarketplaceTransaction.findById(t._id).lean()).toMatchObject({ status: 'refunded', refundedAmount: 100 })
      expect((await Sponsorship.findById(campaign._id).lean())?.status).toBe('paused')
    })

    it('a rent refund marks the payment refunded and queues landlord recovery, without debiting the landlord', async () => {
      const payment = await rentPayment()
      await deliver(chargeSuccess(payment.reference))
      expect(await balance(payment.landlordId!)).toBe(100)
      const statuses = (await Promise.all(Array.from({ length: 3 }, () => deliver(refund(payment.reference, 10000, `${payment.reference}-r`))))).map((r) => r.status)
      expect(statuses.every((s) => s === 200)).toBe(true)
      expect(await Payment.findById(payment._id).lean()).toMatchObject({ status: 'refunded', refundedAmount: 100, refundRecovery: 'required', refundRecoveryAmount: 100 })
      expect(await balance(payment.landlordId!)).toBe(100)
      expect(alerts('payment_refund_recovery_required')).toHaveLength(1)
    })

    it('a chargeback holds a paid order and its resolution restores it; a disputed payment is flagged', async () => {
      const t = await order({ status: 'paid' })
      await deliver({ event: 'charge.dispute.create', data: { id: `${t.reference}-d`, transaction: { reference: t.reference } } })
      expect(await MarketplaceTransaction.findById(t._id).lean()).toMatchObject({ status: 'disputed', preDisputeStatus: 'paid' })
      await deliver({ event: 'charge.dispute.resolve', data: { id: `${t.reference}-d`, resolution: 'declined', transaction: { reference: t.reference } } })
      const restored = await MarketplaceTransaction.findById(t._id).lean()
      expect(restored?.status).toBe('paid')
      expect(restored?.preDisputeStatus).toBeUndefined()

      const payment = await rentPayment({ status: 'completed' })
      await deliver({ event: 'charge.dispute.create', data: { id: `${payment.reference}-d`, transaction: { reference: payment.reference } } })
      expect((await Payment.findById(payment._id).lean())?.disputeStatus).toBe('open')
      expect(alerts('payment_dispute_opened')).toHaveLength(1)
      await deliver({ event: 'charge.dispute.resolve', data: { id: `${payment.reference}-d`, resolution: 'merchant-accepted', transaction: { reference: payment.reference } } })
      expect(await Payment.findById(payment._id).lean()).toMatchObject({ disputeStatus: 'resolved', disputeResolution: 'merchant-accepted' })
    })
  })
})

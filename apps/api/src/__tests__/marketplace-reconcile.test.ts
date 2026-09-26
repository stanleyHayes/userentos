import mongoose from 'mongoose'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../services/notify.js', () => ({ notify: vi.fn().mockResolvedValue(undefined), notifyPaymentConfirmed: vi.fn(), notifyPaymentReceived: vi.fn() }))
vi.mock('../models/AuditLog.js', () => ({ AuditLog: { create: vi.fn().mockResolvedValue({}) } }))
const paystack = vi.hoisted(() => ({ verifyTransaction: vi.fn() }))
vi.mock('../services/marketplace/paystack.js', async (orig) => ({ ...(await orig() as Record<string, unknown>), verifyTransaction: paystack.verifyTransaction }))
import { WebhookEvent } from '../models/WebhookEvent.js'
import { MarketplaceTransaction } from '../models/MarketplaceTransaction.js'
import { TransactionNotFoundError } from '../services/marketplace/paystack.js'
import { retryUnprocessedWebhooks, reconcilePendingTransactions, reconcileCheckout, MAX_WEBHOOK_ATTEMPTS, ABANDONED_AFTER_MS } from '../services/marketplace/reconcile.js'
import { BINDING_KEY } from '../services/marketplace/settle.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

/*
 * The dead-letter sweep re-dispatches stored Paystack events through the one
 * dispatcher, and the settlement sweep asks the provider about open checkouts
 * on a backoff. Both against a real database: the guarantees are conditional
 * updates, which mocks cannot exercise.
 */
describe.skipIf(!hasTestMongo)('marketplace dead-letter retry and settlement reconciliation (spec §8.4)', () => {
  const buyer = `mkt-reconcile-${new mongoose.Types.ObjectId()}`
  const tag = buyer.slice(-8)
  let n = 0
  const mine = () => ({ reference: { $regex: `^MKT-${tag}-` } })

  async function txn(fields: Record<string, unknown> = {}) {
    const _id = new mongoose.Types.ObjectId()
    const doc = {
      _id, reference: `MKT-${tag}-${++n}`, buyerId: buyer, buyerEmail: 'buyer@rentos.test', sellerId: `seller-${tag}`, purpose: 'service_booking',
      grossAmount: 100, discountAmount: 0, platformFeePercent: 5, platformFeeAmount: 5, sellerExpectedAmount: 95,
      status: 'pending', providerBound: true, processedEventIds: [], currency: 'GHS', createdAt: new Date(Date.now() - 60 * 60_000), updatedAt: new Date(),
      ...fields,
    }
    // Raw insert so createdAt can be set in the past.
    await MarketplaceTransaction.collection.insertOne(doc as never)
    return doc
  }
  const success = (t: { _id: unknown; reference: string }, amount = 100) => ({ status: 'success', amount, currency: 'GHS', reference: t.reference, fees: 1.5, metadata: { [BINDING_KEY]: String(t._id) }, raw: {} })
  async function storedCharge(t: { reference: string }, attempts = 1) {
    const eventId = `charge.success:evt-${t.reference}`
    await WebhookEvent.create({ provider: 'paystack', eventId, eventType: 'charge.success', reference: t.reference, payload: JSON.stringify({ event: 'charge.success', data: { id: `evt-${t.reference}`, reference: t.reference, amount: 10000, currency: 'GHS' } }), attempts })
    return eventId
  }

  beforeAll(async () => { await mongoose.connect(testMongoUri); await Promise.all([MarketplaceTransaction.init(), WebhookEvent.init()]) })
  beforeEach(() => { paystack.verifyTransaction.mockReset() })
  afterAll(async () => {
    await WebhookEvent.deleteMany({ reference: { $regex: `^MKT-${tag}-` } })
    await MarketplaceTransaction.deleteMany({ buyerId: buyer })
    await mongoose.disconnect()
  })

  describe('webhook dead-letter retry', () => {
    it('recovers a payment whose webhook processing had failed, once', async () => {
      const t = await txn()
      const eventId = await storedCharge(t)
      paystack.verifyTransaction.mockResolvedValue(success(t))
      // Two overlapping sweeps: the lease lets one process the event.
      const [a, b] = await Promise.all([retryUnprocessedWebhooks(50, mine()), retryUnprocessedWebhooks(50, mine())])
      expect(a.recovered + b.recovered).toBe(1)
      expect(await MarketplaceTransaction.findById(t._id).lean()).toMatchObject({ status: 'paid', processedEventIds: [eventId] })
      expect((await WebhookEvent.findOne({ eventId }).lean())?.processedAt).toBeInstanceOf(Date)
      expect((await retryUnprocessedWebhooks(50, mine())).recovered).toBe(0)
    })

    it('does not mark paid when the provider still says the payment failed', async () => {
      const t = await txn()
      const eventId = await storedCharge(t)
      paystack.verifyTransaction.mockResolvedValue({ ...success(t), status: 'failed' })
      await retryUnprocessedWebhooks(50, mine())
      expect((await MarketplaceTransaction.findById(t._id).lean())?.status).toBe('pending')
      // A definitive answer, not a failure to retry.
      expect((await WebhookEvent.findOne({ eventId }).lean())?.processedAt).toBeInstanceOf(Date)
    })

    it.each([
      ['an amount the provider disagrees on', (t: { _id: unknown; reference: string }) => success(t, 10)],
      ['a charge carrying no binding to the row', (t: { _id: unknown; reference: string }) => ({ ...success(t), metadata: {} })],
    ])('refuses to settle %s', async (_label, verified) => {
      const t = await txn()
      await storedCharge(t)
      paystack.verifyTransaction.mockResolvedValue(verified(t))
      await retryUnprocessedWebhooks(50, mine())
      expect((await MarketplaceTransaction.findById(t._id).lean())?.status).toBe('pending')
    })

    it('never recovers a failed row whose reference succeeded elsewhere on the account', async () => {
      const t = await txn({ status: 'failed' })
      await storedCharge(t)
      // A charge that carries no binding to this row belongs to something else.
      paystack.verifyTransaction.mockResolvedValue({ ...success(t), metadata: { purpose: 'wallet_deposit' } })
      await retryUnprocessedWebhooks(50, mine())
      expect((await MarketplaceTransaction.findById(t._id).lean())?.status).toBe('failed')
    })

    it('recovers a closed checkout\'s own late charge as a late success', async () => {
      const t = await txn({ status: 'failed', failureReason: 'abandoned' })
      const eventId = await storedCharge(t)
      paystack.verifyTransaction.mockResolvedValue(success(t))
      expect((await retryUnprocessedWebhooks(50, mine())).recovered).toBe(1)
      expect(await MarketplaceTransaction.findById(t._id).lean()).toMatchObject({ status: 'paid', lateSuccessAt: expect.any(Date), processedEventIds: [eventId] })
    })

    it('records the error, hands the claim back, and gives up after the attempt ceiling', async () => {
      const t = await txn()
      const eventId = await storedCharge(t, MAX_WEBHOOK_ATTEMPTS - 1)
      paystack.verifyTransaction.mockRejectedValue(new Error('provider timeout'))
      expect((await retryUnprocessedWebhooks(50, mine())).exhausted).toBe(1)
      const row = await WebhookEvent.findOne({ eventId }).lean()
      expect(row).toMatchObject({ attempts: MAX_WEBHOOK_ATTEMPTS, processingError: expect.stringMatching(/provider timeout/) })
      expect(row?.processedAt).toBeUndefined()
      expect((await MarketplaceTransaction.findById(t._id).lean())?.processedEventIds).toEqual([])
      // Kept for a human, never picked up again.
      await retryUnprocessedWebhooks(50, mine())
      expect((await WebhookEvent.findOne({ eventId }).lean())?.attempts).toBe(MAX_WEBHOOK_ATTEMPTS)
    })
  })

  describe('settlement reconciliation', () => {
    const scope = { buyerId: buyer }
    beforeEach(async () => { await MarketplaceTransaction.deleteMany({ buyerId: buyer }) })

    it('only examines checkouts old enough that a webhook should have arrived', async () => {
      await txn({ createdAt: new Date() })
      expect((await reconcilePendingTransactions(30, 50, { scope })).examined).toBe(0)
      expect(paystack.verifyTransaction).not.toHaveBeenCalled()
    })

    it('abandoned checkouts no longer starve a paid one, and are closed once a day old', async () => {
      const old = new Date(Date.now() - ABANDONED_AFTER_MS - 60_000)
      const abandoned = await Promise.all(Array.from({ length: 60 }, () => txn({ createdAt: old, openOrderKey: `booking:abandoned-${tag}-${++n}` })))
      const paid = await txn({ createdAt: new Date(Date.now() - 60 * 60_000), openOrderKey: `booking:paid-${tag}` })
      paystack.verifyTransaction.mockImplementation(async (reference: string) => reference === paid.reference ? success(paid) : { status: 'abandoned', reference, amount: 100, currency: 'GHS', raw: {} })

      await reconcilePendingTransactions(30, 50, { scope })
      await reconcilePendingTransactions(30, 50, { scope })

      const settled = await MarketplaceTransaction.findById(paid._id).lean()
      expect(settled).toMatchObject({ status: 'paid' })
      expect(settled?.openOrderKey).toBeUndefined()
      expect(await MarketplaceTransaction.countDocuments({ _id: { $in: abandoned.map((a) => a._id) }, status: 'failed', failureReason: 'abandoned', openOrderKey: { $exists: false } })).toBe(60)
      // Settled exactly once, and nothing is asked about again.
      paystack.verifyTransaction.mockClear()
      expect((await reconcilePendingTransactions(30, 50, { scope })).examined).toBe(0)
    })

    it('leaves a young abandoned checkout open, and backs off before asking again', async () => {
      const t = await txn({ createdAt: new Date(Date.now() - 60 * 60_000) })
      paystack.verifyTransaction.mockResolvedValue({ status: 'abandoned', reference: t.reference, amount: 100, currency: 'GHS', raw: {} })
      expect(await reconcilePendingTransactions(30, 50, { scope })).toEqual({ examined: 1, corrected: 0 })
      expect(await MarketplaceTransaction.findById(t._id).lean()).toMatchObject({ status: 'pending', reconcileAttempts: 1 })
      expect((await reconcilePendingTransactions(30, 50, { scope })).examined).toBe(0)
      expect(paystack.verifyTransaction).toHaveBeenCalledTimes(1)
    })

    it('closes a day-old checkout Paystack has no record of, but never on an outage', async () => {
      const old = new Date(Date.now() - ABANDONED_AFTER_MS - 60_000)
      const unknown = await txn({ createdAt: old })
      const unreachable = await txn({ createdAt: old })
      paystack.verifyTransaction.mockImplementation(async (reference: string) => {
        if (reference === unknown.reference) throw new TransactionNotFoundError('Paystack /transaction/verify failed (400): Transaction reference not found')
        throw new Error('Paystack /transaction/verify failed (502): Bad gateway')
      })
      const result = await reconcilePendingTransactions(30, 50, { scope })
      // The outage did not abort the sweep; the other checkout was still handled.
      expect(result).toEqual({ examined: 2, corrected: 1 })
      expect(await MarketplaceTransaction.findById(unknown._id).lean()).toMatchObject({ status: 'failed', failureReason: 'expired' })
      expect((await MarketplaceTransaction.findById(unreachable._id).lean())?.status).toBe('pending')
    })

    it('closes a checkout the provider failed with a conditional update, never over a settled row', async () => {
      const t = await txn()
      paystack.verifyTransaction.mockImplementation(async () => {
        // A webhook settles it while the sweep is asking.
        await MarketplaceTransaction.updateOne({ _id: t._id }, { $set: { status: 'paid' } })
        return { status: 'failed', reference: t.reference, amount: 100, currency: 'GHS', raw: {} }
      })
      await reconcilePendingTransactions(30, 50, { scope })
      expect((await MarketplaceTransaction.findById(t._id).lean())?.status).toBe('paid')
    })

    it('a success found for a checkout closed while it was being checked is applied as a late success', async () => {
      const t = await txn({ openOrderKey: `booking:closing-${tag}` })
      paystack.verifyTransaction.mockImplementation(async () => {
        // A new checkout for the order closes this one as abandoned mid-check.
        await MarketplaceTransaction.updateOne({ _id: t._id }, { $set: { status: 'failed', failureReason: 'abandoned' }, $unset: { openOrderKey: 1 } })
        return success(t)
      })
      expect(await reconcilePendingTransactions(30, 50, { scope })).toEqual({ examined: 1, corrected: 1 })
      const saved = await MarketplaceTransaction.findById(t._id).lean()
      expect(saved).toMatchObject({ status: 'paid', lateSuccessAt: expect.any(Date) })
      expect(saved?.failureReason).toBeUndefined()
    })

    it('reconcileCheckout applies the late-success rule to a checkout already closed', async () => {
      const t = await txn({ status: 'failed', failureReason: 'expired' })
      paystack.verifyTransaction.mockResolvedValue(success(t))
      const row = await MarketplaceTransaction.findById(t._id)
      expect(await reconcileCheckout(row!)).toBe('paid')
      expect(await MarketplaceTransaction.findById(t._id).lean()).toMatchObject({ status: 'paid', lateSuccessAt: expect.any(Date) })
    })
  })
})

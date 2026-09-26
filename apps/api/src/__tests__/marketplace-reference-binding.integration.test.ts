import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Paystack as it behaves for this account: the wallet deposit's reference has
// already been used, so initializing it again is refused, but verifying it
// reports the deposit's success. Every marketplace reference is still unpaid.
const provider = vi.hoisted(() => ({ depositRef: '', initialized: [] as Array<{ reference: string; metadata?: Record<string, unknown> }> }))
vi.mock('../services/marketplace/paystack.js', async (orig) => ({
  ...(await orig() as Record<string, unknown>),
  initializeSplitTransaction: vi.fn(async (input: { reference: string; metadata?: Record<string, unknown> }) => {
    if (input.reference === provider.depositRef) throw new Error('Paystack /transaction/initialize failed (400): Duplicate Transaction Reference')
    provider.initialized.push(input)
    return { authorizationUrl: 'https://checkout.paystack.test/x', accessCode: `AC-${input.reference}`, reference: input.reference }
  }),
  verifyTransaction: vi.fn(async (reference: string) => reference === provider.depositRef
    ? { status: 'success', reference, amount: 100, currency: 'GHS', fees: 1.5, metadata: { purpose: 'wallet_deposit' }, raw: {} }
    : { status: 'abandoned', reference, amount: 100, currency: 'GHS', metadata: {}, raw: {} }),
}))
vi.mock('../services/entitlements.js', async (orig) => ({
  ...(await orig() as Record<string, unknown>),
  getNumericFeature: vi.fn().mockResolvedValue(5),
}))
vi.mock('../utils/audit.js', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }))

import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { Payment } from '../models/Payment.js'
import { PaymentAccount } from '../models/PaymentAccount.js'
import { ServiceBooking } from '../models/ServiceBooking.js'
import { MarketplaceTransaction } from '../models/MarketplaceTransaction.js'
import router from '../routes/marketplacePayments.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

const uri = testMongoUri
describe.skipIf(!hasTestMongo)('marketplace provider references', () => {
  const buyer = new mongoose.Types.ObjectId(), other = new mongoose.Types.ObjectId(), seller = new mongoose.Types.ObjectId()
  const bookingId = new mongoose.Types.ObjectId()
  const tag = String(buyer).slice(-8)
  let server: Server, url: string
  const auth = (id: mongoose.Types.ObjectId) => ({
    Authorization: `Bearer ${jwt.sign({ userId: String(id), roles: ['tenant'], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`,
    'Content-Type': 'application/json',
  })
  const initialize = (as: mongoose.Types.ObjectId, idempotencyKey: string) => fetch(`${url}/initialize`, {
    method: 'POST', headers: auth(as),
    body: JSON.stringify({ purpose: 'service_booking', bookingId: String(bookingId), email: 'buyer@rentos.test', idempotencyKey }),
  })

  beforeAll(async () => {
    await mongoose.connect(uri)
    await MarketplaceTransaction.init()
    provider.depositRef = `DEP-${Date.now()}-${tag}`
    await User.create([buyer, other, seller].map((_id, i) => ({
      _id, email: `mkt-ref-${i}-${_id}@rentos.test`, phone: '0241234567', firstName: 'Ref', lastName: 'Fixture',
      passwordHash: 'fixture-only', roles: ['tenant'], activeRole: 'tenant',
    })))
    // The buyer's own completed wallet deposit of the same amount.
    await Payment.create({ tenantId: String(buyer), purpose: 'wallet_deposit', amount: 100, method: 'mtn_momo', reference: provider.depositRef, status: 'completed', collectionSource: 'paystack' })
    await PaymentAccount.create({ ownerId: String(seller), businessName: 'Fixture Works', bankCode: 'MTN', bankName: 'MTN', accountNumberMasked: '••••4567', subaccountCode: `ACCT_${tag}`, status: 'ready', readyToReceivePayments: true })
    const app = express(); app.use(express.json()); app.use('/pay', router)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/pay`
  })
  beforeEach(async () => {
    provider.initialized = []
    await MarketplaceTransaction.deleteMany({ buyerId: { $in: [String(buyer), String(other)] } })
    await MarketplaceTransaction.deleteMany({ reference: provider.depositRef })
    await ServiceBooking.deleteOne({ _id: bookingId })
    await ServiceBooking.create({ _id: bookingId, requesterId: String(buyer), requesterRole: 'tenant', workerId: `worker-${tag}`, workerUserId: String(seller), description: 'Fix the gate', status: 'completed', quoteProvided: true, quoteAmount: 100, quoteAccepted: true })
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    await MarketplaceTransaction.deleteMany({ $or: [{ buyerId: { $in: [String(buyer), String(other)] } }, { reference: provider.depositRef }] })
    await ServiceBooking.deleteOne({ _id: bookingId })
    await PaymentAccount.deleteOne({ ownerId: String(seller) })
    await Payment.deleteOne({ reference: provider.depositRef })
    await User.deleteMany({ _id: { $in: [buyer, other, seller] } })
    await mongoose.disconnect()
  })

  it('cannot settle an order by naming a wallet deposit reference as the idempotency key', async () => {
    const res = await initialize(buyer, provider.depositRef)
    expect(res.status).toBe(201)
    const { data } = await res.json()
    // The provider reference is minted by the server; the key is only a key.
    expect(data.reference).toMatch(/^MKT-/)
    expect(data.reference).not.toBe(provider.depositRef)
    expect(provider.initialized[0].metadata).toMatchObject({ rentosTransactionId: expect.any(String) })

    // Polling the deposit's reference finds no order to settle.
    expect((await fetch(`${url}/verify/${provider.depositRef}`, { headers: auth(buyer) })).status).toBe(404)
    // Polling the order's own reference asks the provider about THAT charge.
    const verify = await fetch(`${url}/verify/${data.reference}`, { headers: auth(buyer) })
    expect(verify.status).toBe(200)
    expect((await verify.json()).data.status).toBe('pending')

    expect(await MarketplaceTransaction.countDocuments({ buyerId: String(buyer), status: 'paid' })).toBe(0)
    expect((await ServiceBooking.findById(bookingId).lean())?.paymentStatus).toBe('pending')
  })

  it('never settles a failed row left behind with a deposit reference', async () => {
    // What the old code stored: the client key as the reference, marked
    // failed when Paystack refused the duplicate.
    const legacy = await MarketplaceTransaction.create({
      reference: provider.depositRef, buyerId: String(buyer), buyerEmail: 'buyer@rentos.test', sellerId: String(seller),
      bookingId: String(bookingId), purpose: 'service_booking', grossAmount: 100, platformFeePercent: 5,
      platformFeeAmount: 5, sellerExpectedAmount: 95, status: 'failed',
    })
    const res = await fetch(`${url}/verify/${provider.depositRef}`, { headers: auth(buyer) })
    expect(res.status).toBe(200)
    expect((await MarketplaceTransaction.findById(legacy._id).lean())?.status).toBe('failed')
    expect((await ServiceBooking.findById(bookingId).lean())?.paymentStatus).toBe('pending')
  })

  it('requires a session and the buyer to verify', async () => {
    const { data } = await (await initialize(buyer, `key-${tag}-verify`)).json()
    expect((await fetch(`${url}/verify/${data.reference}`)).status).toBe(401)
    expect((await fetch(`${url}/verify/${data.reference}`, { headers: auth(other) })).status).toBe(404)
  })

  it('replays an idempotency key only for the buyer who used it', async () => {
    const key = `key-${tag}-replay`
    const first = (await (await initialize(buyer, key)).json()).data
    const replay = await initialize(buyer, key)
    expect(replay.status).toBe(200)
    expect((await replay.json()).data).toMatchObject({ reference: first.reference, alreadyInitialized: true })
    expect(await MarketplaceTransaction.countDocuments({ buyerId: String(buyer) })).toBe(1)

    // Another account holding the same key gets no view of the buyer's
    // transaction or its access code — only its own (refused) checkout.
    const foreign = await initialize(other, key)
    expect(foreign.status).toBe(404)
    expect(JSON.stringify(await foreign.json())).not.toContain(first.reference)
  })
})

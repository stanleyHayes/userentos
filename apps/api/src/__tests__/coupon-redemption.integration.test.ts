import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
vi.mock('../utils/audit.js', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }))
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { Promotion, CouponRedemption } from '../models/Promotion.js'
import { MarketplaceTransaction } from '../models/MarketplaceTransaction.js'
import { redeemForTransaction } from '../services/marketplace/coupons.js'
import { applySuccessfulCharge, BINDING_KEY } from '../services/marketplace/settle.js'
import commerce from '../routes/marketplaceCommerce.js'

const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('coupon redemption', () => {
  const tag = new mongoose.Types.ObjectId().toString().slice(-10).toUpperCase()
  const attacker = new mongoose.Types.ObjectId()
  const codes: string[] = []
  let server: Server, url: string

  async function promotion(over: Record<string, unknown> = {}) {
    const code = `IT${tag}${codes.length}`
    codes.push(code)
    return Promotion.create({
      code, type: 'percentage', value: 10, fundingSource: 'seller', ownerId: 'seller-fixture',
      startAt: new Date(Date.now() - 86_400_000), endAt: new Date(Date.now() + 86_400_000), ...over,
    })
  }
  const usedCount = async (code: string) => (await Promotion.findOne({ code }).lean())?.usedCount

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create({ _id: attacker, email: `coupon-${attacker}@rentos.test`, phone: '0241234567', firstName: 'C', lastName: 'Fixture', passwordHash: 'fixture-only', roles: ['tenant'], activeRole: 'tenant' })
    const app = express(); app.use(express.json()); app.use('/m', commerce)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/m`
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    await CouponRedemption.deleteMany({ code: { $in: codes } })
    await MarketplaceTransaction.deleteMany({ couponCode: { $in: codes } })
    await Promotion.deleteMany({ code: { $in: codes } })
    await User.deleteOne({ _id: attacker })
    await mongoose.disconnect()
  })

  it('offers no endpoint that burns a seller coupon without a payment', async () => {
    const promo = await promotion({ usageLimit: 1 })
    const token = jwt.sign({ userId: String(attacker), roles: ['tenant'], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })
    const res = await fetch(`${url}/promotions/redeem`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: promo.code, amount: 1 }),
    })
    expect(res.status).toBe(404)
    expect(await usedCount(promo.code)).toBe(0)
  })

  it('lets only one of two concurrent settlements take the last use', async () => {
    const promo = await promotion({ usageLimit: 1 })
    const buyers = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()].map(String)
    const results = await Promise.all(buyers.map((buyerId, i) => redeemForTransaction({ reference: `MKT-IT-${tag}-${i}`, buyerId, couponCode: promo.code, discountAmount: 10 })))
    expect(results.filter((r) => r.redeemed)).toHaveLength(1)
    expect(await usedCount(promo.code)).toBe(1)
    expect(await CouponRedemption.countDocuments({ code: promo.code, overLimit: true })).toBe(1)
  })

  it('enforces the per-buyer limit atomically', async () => {
    const promo = await promotion({ perUserLimit: 1 })
    const buyerId = String(new mongoose.Types.ObjectId())
    const results = await Promise.all([0, 1, 2].map((i) => redeemForTransaction({ reference: `MKT-IT-${tag}-u${i}`, buyerId, couponCode: promo.code, discountAmount: 10 })))
    expect(results.filter((r) => r.redeemed)).toHaveLength(1)
    const saved = await Promotion.findOne({ code: promo.code }).select('+perUserCounts').lean()
    expect(saved?.usedCount).toBe(1)
    expect((saved?.perUserCounts as unknown as Record<string, number>)[buyerId]).toBe(1)
    // A different buyer still has their own use.
    expect(await redeemForTransaction({ reference: `MKT-IT-${tag}-u9`, buyerId: String(new mongoose.Types.ObjectId()), couponCode: promo.code, discountAmount: 10 })).toEqual({ redeemed: true })
  })

  it('counts a use exactly once when the webhook and a /verify poll settle together', async () => {
    const promo = await promotion()
    const t = await MarketplaceTransaction.create({
      reference: `MKT-IT-${tag}-settle`, buyerId: String(attacker), buyerEmail: 'b@rentos.test', sellerId: 'seller-fixture',
      purpose: 'service_booking', grossAmount: 100, discountAmount: 10, couponCode: promo.code, platformFeePercent: 5,
      platformFeeAmount: 4.5, sellerExpectedAmount: 85.5, status: 'pending', providerBound: true,
    })
    const verified = { status: 'success', amount: 90, currency: 'GHS', reference: t.reference, metadata: { [BINDING_KEY]: String(t._id) } }
    const [a, b] = await Promise.all([
      MarketplaceTransaction.findById(t._id).then((doc) => applySuccessfulCharge(doc!, verified, 'webhook')),
      MarketplaceTransaction.findById(t._id).then((doc) => applySuccessfulCharge(doc!, verified, 'verify')),
    ])
    expect([a.applied, b.applied].filter(Boolean)).toHaveLength(1)
    expect(await usedCount(promo.code)).toBe(1)
    expect(await CouponRedemption.countDocuments({ transactionRef: t.reference })).toBe(1)
  })
})

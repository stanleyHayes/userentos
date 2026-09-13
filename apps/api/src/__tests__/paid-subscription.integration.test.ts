import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { User } from '../models/User.js'
import { Payment } from '../models/Payment.js'
import { activatePaidSubscription, currentPaidSubscription, subscriptionPeriod } from '../services/payments/paidSubscription.js'
import { resolveEntitlements } from '../services/entitlements.js'
import { subscriptionController } from '../controllers/subscriptionController.js'
const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'
describe('paid subscription periods', () => {
  it('clamps January and leap-day anniversaries without rolling into another month', () => {
    expect(subscriptionPeriod(new Date('2026-01-31T12:34:00Z'), 'monthly').toISOString()).toBe('2026-02-28T12:34:00.000Z')
    expect(subscriptionPeriod(new Date('2024-02-29T12:34:00Z'), 'yearly').toISOString()).toBe('2025-02-28T12:34:00.000Z')
  })
})
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('saved subscription activation', () => {
  const userIds: string[] = [], paymentIds: mongoose.Types.ObjectId[] = []
  beforeAll(async () => { await mongoose.connect(uri) })
  afterAll(async () => { await User.deleteMany({ _id: { $in: userIds } }); await Payment.deleteMany({ _id: { $in: paymentIds } }); await mongoose.disconnect() })
  async function user() {
    const u = await User.create({ email: `paid-${new mongoose.Types.ObjectId()}@rentos.test`, phone: '0240000000', firstName: 'Test', lastName: 'Subscription', passwordHash: 'not-a-password', roles: ['landlord'], activeRole: 'landlord' });userIds.push(String(u._id));return u
  }
  async function payment(userId: string, paidAt = new Date(Date.now() - 60_000).toISOString(), amount = 99) {
    const id = new mongoose.Types.ObjectId();paymentIds.push(id)
    return Payment.create({ _id: id, tenantId: userId, amount, purpose: 'subscription', status: 'completed', method: 'bank_transfer', reference: `SUB-FIXTURE-${id}`, paidAt, subscriptionTerms: { version: 1, capturedAt: new Date(), packageId: String(new mongoose.Types.ObjectId()), packageVersion: 3, packageName: 'Purchased plan', amount: 99, currency: 'GHS', billingCycle: 'monthly', benefits: ['Original benefit'], featuresJson: JSON.stringify({ 'property.limit': 7, 'blog.limit': 5 }) } })
  }
  it('activates and resolves saved terms even when the original package no longer exists', async () => {
    const u = await user(), p = await payment(String(u._id))
    expect(await activatePaidSubscription(String(p._id))).toBe(true)
    const saved = await User.findById(u._id).lean()
    expect((await currentPaidSubscription(saved!))?.active).toBe(true)
    expect((await resolveEntitlements(String(u._id))).features).toMatchObject({ 'property.limit': 7, 'blog.limit': 5 })
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    await subscriptionController.mySubscription({ user: { userId: String(u._id) } } as never, response as never)
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ billingSource: 'provider', maxProperties: 7, package: expect.objectContaining({ price: 99, name: 'Purchased plan', version: 3 }) }) }))
    const end = saved!.subscriptionEndDate
    expect(await activatePaidSubscription(String(p._id), new Date(Date.now() + 60_000))).toBe(true)
    expect((await User.findById(u._id).lean())?.subscriptionEndDate).toEqual(end)
  })
  it('recovers a lost completion marker without moving coverage dates', async () => {
    const u = await user(), p = await payment(String(u._id))
    const originalUpdate = Payment.updateOne.bind(Payment)
    const spy = vi.spyOn(Payment, 'updateOne').mockImplementationOnce(originalUpdate).mockRejectedValueOnce(new Error('lost acknowledgement'))
    try { await expect(activatePaidSubscription(String(p._id))).rejects.toThrow('lost acknowledgement') } finally { spy.mockRestore() }
    const before = await User.findById(u._id).lean()
    await Payment.updateOne({ _id: p._id }, { $set: { paidAt: new Date().toISOString(), subscriptionCoverageEndsAt: new Date('2099-01-01') } })
    expect(await activatePaidSubscription(String(p._id))).toBe(true)
    expect((await User.findById(u._id).lean())?.subscriptionEndDate).toEqual(before?.subscriptionEndDate)
  })
  it('an older completion cannot replace a newer purchased subscription', async () => {
    const u = await user(), old = await payment(String(u._id), new Date(Date.now() - 120_000).toISOString()), recent = await payment(String(u._id))
    await activatePaidSubscription(String(recent._id));await activatePaidSubscription(String(old._id))
    expect((await User.findById(u._id).lean())?.subscriptionPaymentId).toBe(String(recent._id))
    expect((await Payment.findById(old._id).lean())?.subscriptionActivationResult).toBe('superseded')
  })
  it('expired confirmation does not restart coverage on retry', async () => {
    const u = await user(), p = await payment(String(u._id), '2020-01-31T12:00:00Z')
    expect(await activatePaidSubscription(String(p._id))).toBe(true)
    expect((await User.findById(u._id).lean())?.subscriptionPackageId).toBeUndefined()
    expect((await Payment.findById(p._id).lean())?.subscriptionActivationResult).toBe('expired')
  })
  it('mismatched payment amount and suspended accounts do not receive access', async () => {
    const u = await user(), bad = await payment(String(u._id), undefined, 1)
    expect(await activatePaidSubscription(String(bad._id))).toBe(false)
    const p = await payment(String(u._id));await User.updateOne({ _id: u._id }, { $set: { suspendedAt: new Date() } })
    expect(await activatePaidSubscription(String(p._id))).toBe(false)
    expect((await User.findById(u._id).lean())?.subscriptionPackageId).toBeUndefined()
  })
  it('a later refund removes paid features on the next entitlement read', async () => {
    const u = await user(), p = await payment(String(u._id))
    await activatePaidSubscription(String(p._id))
    await Payment.updateOne({ _id: p._id }, { $set: { status: 'refunded' } })
    expect((await resolveEntitlements(String(u._id))).features['blog.limit']).toBe(0)
    expect((await currentPaidSubscription((await User.findById(u._id).lean())!))?.active).toBe(false)
  })
  it('simultaneous payments with equal timestamps settle on a stable latest identifier', async () => {
    const u = await user(), paidAt = new Date(Date.now() - 60_000).toISOString()
    const a = await payment(String(u._id), paidAt), b = await payment(String(u._id), paidAt)
    await Promise.all([activatePaidSubscription(String(a._id)), activatePaidSubscription(String(b._id))])
    expect((await User.findById(u._id).lean())?.subscriptionPaymentId).toBe([String(a._id), String(b._id)].sort().at(-1))
  })
  it('a subsequent manual assignment cannot inherit the previous purchase snapshot', async () => {
    const u = await user(), p = await payment(String(u._id))
    await activatePaidSubscription(String(p._id))
    await User.updateOne({ _id: u._id }, { $set: { subscriptionPackageId: 'manual-plan', subscriptionStartDate: new Date() } })
    expect(await currentPaidSubscription((await User.findById(u._id).lean())!)).toBeNull()
  })
})

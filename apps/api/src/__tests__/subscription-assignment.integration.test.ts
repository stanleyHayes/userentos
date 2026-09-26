import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { User } from '../models/User.js'
import { SubscriptionPackage } from '../models/SubscriptionPackage.js'
import { assignSubscription } from '../services/assignSubscription.js'
import { expireSubscription } from '../services/subscriptionExpiry.js'
import { resolveEntitlements } from '../services/entitlements.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'
const uri = testMongoUri
describe.skipIf(!hasTestMongo)('subscription assignment and saved-term expiry', () => {
  const ids: string[] = [], plans: string[] = []
  beforeAll(async () => { await mongoose.connect(uri) })
  afterAll(async () => { await User.deleteMany({ _id: { $in: ids } }); await SubscriptionPackage.deleteMany({ _id: { $in: plans } }); await mongoose.disconnect() })
  async function fixture() {
    const plan = await SubscriptionPackage.create({ name: 'Free fixture', slug: `free-${new mongoose.Types.ObjectId()}`, description: 'fixture', price: 0, maxProperties: 1, version: 4 });plans.push(String(plan._id))
    const uid = new mongoose.Types.ObjectId(), paidPlan = String(new mongoose.Types.ObjectId()), paymentId = String(new mongoose.Types.ObjectId())
    const start = new Date('2026-01-31T12:00:00Z'), end = new Date('2026-02-28T12:00:00Z')
    const snapshot = JSON.stringify({ paymentId, startsAt: start.toISOString(), endsAt: end.toISOString(), terms: { packageId: paidPlan, packageVersion: 2, packageName: 'Original paid plan', amount: 100, featuresJson: JSON.stringify({ 'property.limit': 9 }) } })
    const user = await User.create({ _id: uid, email: `assignment-${uid}@rentos.test`, phone: '0240000000', firstName: 'Fixture', lastName: 'User', passwordHash: 'fixture', roles: ['landlord'], activeRole: 'landlord', subscriptionPackageId: paidPlan, subscriptionPlanVersion: 2, subscriptionPaymentId: paymentId, subscriptionSnapshotJson: snapshot, subscriptionStartDate: start, subscriptionEndDate: end });ids.push(String(uid))
    return { user, plan, observed: { userId: String(uid), packageId: paidPlan, expiresAt: end, subscriptionStartDate: start, subscriptionPlanVersion: 2, subscriptionPaymentId: paymentId, subscriptionSnapshotJson: snapshot } }
  }
  it('downgrades an expired saved purchase even when its catalogue package is absent and clears paid metadata', async () => {
    const { user, plan, observed } = await fixture()
    expect(await expireSubscription(observed, { id: String(plan._id), price: 0, version: 4 }, new Date('2026-03-01'))).toEqual({ downgradedFrom: 'Original paid plan' })
    const saved = await User.findById(user._id).lean()
    expect(saved?.subscriptionSnapshotJson).toBeUndefined();expect(saved?.subscriptionPaymentId).toBeUndefined();expect(saved?.subscriptionEndDate).toBeUndefined()
    expect((await resolveEntitlements(String(user._id))).features['property.limit']).toBe(1)
  })
  it('a stale expiry cannot clear a renewed purchase with the same package and expiry', async () => {
    const { user, plan, observed } = await fixture()
    await User.updateOne({ _id: user._id }, { $set: { subscriptionPaymentId: 'newer-payment' } })
    expect(await expireSubscription(observed, { id: String(plan._id), price: 0, version: 4 }, new Date('2026-03-01'))).toEqual({})
    expect((await User.findById(user._id).lean())?.subscriptionPaymentId).toBe('newer-payment')
  })
  it('an explicit assignment clears saved paid data and uses a valid calendar anniversary', async () => {
    const { user, plan } = await fixture()
    const assigned = await assignSubscription(user, plan, new Date('2026-03-31T12:00:00Z'))
    expect(assigned?.subscriptionEndDate?.toISOString()).toBe('2026-04-30T12:00:00.000Z')
    expect(assigned?.subscriptionSnapshotJson).toBeUndefined();expect(assigned?.subscriptionPaymentId).toBeUndefined()
    expect(assigned?.subscriptionPlanVersion).toBe(4)
  })
  it('a stale free/admin assignment cannot overwrite a concurrent renewal', async () => {
    const { user, plan } = await fixture()
    await User.updateOne({ _id: user._id }, { $set: { subscriptionStartDate: new Date('2026-03-01'), subscriptionEndDate: new Date('2026-04-01') } })
    expect(await assignSubscription(user, plan)).toBeNull()
    expect((await User.findById(user._id).lean())?.subscriptionPackageId).toBe(user.subscriptionPackageId)
  })
})

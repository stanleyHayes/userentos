import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Payment } from '../models/Payment.js'
import { SubscriptionPackage } from '../models/SubscriptionPackage.js'
import { PlanEntitlement } from '../models/PlanEntitlement.js'
import { captureSubscriptionTerms } from '../services/payments/subscriptionTerms.js'
const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('immutable subscription purchase terms', () => {
  const ids: mongoose.Types.ObjectId[] = []
  beforeAll(async () => { await mongoose.connect(uri) })
  afterAll(async () => { await Payment.deleteMany({ _id: { $in: ids } }); await SubscriptionPackage.deleteMany({ _id: { $in: ids } }); await PlanEntitlement.deleteMany({ planId: { $in: ids.map(String) } }); await mongoose.disconnect() })
  it('freezes price, billing period, legacy limits and explicit grants across package edits/deletion', async () => {
    const id = new mongoose.Types.ObjectId(); ids.push(id)
    const pkg = await SubscriptionPackage.create({ _id: id, name: 'Original', slug: `terms-${id}`, description: 'fixture', price: 99, billingCycle: 'yearly', maxProperties: 7, benefits: ['Original benefit'], version: 3 })
    await PlanEntitlement.create({ planId: String(id), planVersion: 3, featureKey: 'blog.limit', value: 5 })
    const terms = await captureSubscriptionTerms(pkg)
    await Payment.create({ _id: id, tenantId: 'fixture', amount: terms.amount, purpose: 'subscription', method: 'bank_transfer', status: 'pending', reference: `TERMS-${id}`, subscriptionTerms: terms })
    await SubscriptionPackage.updateOne({ _id: id }, { $set: { price: 200, billingCycle: 'monthly', maxProperties: 1 } })
    await PlanEntitlement.updateOne({ planId: String(id) }, { $set: { value: 100 } })
    await SubscriptionPackage.deleteOne({ _id: id })
    await Payment.updateOne({ _id: id }, { $set: { 'subscriptionTerms.amount': 1, 'subscriptionTerms.featuresJson': '{}' }, $push: { 'subscriptionTerms.benefits': 'Changed benefit' } })
    const saved = (await Payment.findById(id).lean())!.subscriptionTerms!
    expect(saved).toMatchObject({ amount: 99, billingCycle: 'yearly', packageVersion: 3, benefits: ['Original benefit'] })
    expect(JSON.parse(saved.featuresJson)).toMatchObject({ 'property.limit': 7, 'blog.limit': 5 })
    await Payment.updateOne({ _id: id }, { $set: { subscriptionTerms: { ...terms, amount: 2 } } })
    expect((await Payment.findById(id).lean())?.subscriptionTerms?.amount).toBe(99)
  })
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('refuses invalid paid price %s before capturing grants', async price => {
    await expect(captureSubscriptionTerms({ _id: 'fixture', price })).rejects.toThrow('Invalid paid subscription price')
  })
})

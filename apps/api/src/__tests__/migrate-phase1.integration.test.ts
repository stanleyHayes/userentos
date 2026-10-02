import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SubscriptionPackage } from '../models/SubscriptionPackage.js'
import { PlanEntitlement } from '../models/PlanEntitlement.js'
import { User } from '../models/User.js'
import { Property } from '../models/Property.js'
import { Storefront } from '../models/Storefront.js'
import { BlogPost } from '../models/BlogPost.js'
import { FeatureFlag } from '../models/FeatureFlag.js'
import { migratePhase1 } from '../scripts/migratePhase1.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

// Plans are global by slug, so this suite gets a database of its own rather
// than racing other suites that create plans.
const uri = testMongoUri.replace(/(\/[^/?]+)$/, '$1_phase1')

describe.skipIf(!hasTestMongo)('Phase 1 production migration', () => {
  const subscriber = new mongoose.Types.ObjectId()
  let professionalId = ''

  beforeAll(async () => {
    await mongoose.connect(uri)
    await mongoose.connection.dropDatabase()
    const [starter, professional] = await SubscriptionPackage.create([
      { name: 'Starter', slug: 'starter', description: 'Perfect for individual landlords just getting started', price: 0, maxProperties: 3, benefits: ['List up to 3 properties', 'Email support'], isActive: true, isDefault: true },
      { name: 'Professional', slug: 'professional', description: 'For growing landlords managing multiple properties', price: 50, maxProperties: 10, benefits: ['List up to 10 properties', 'Email support'], isActive: true, sortOrder: 1 },
      { name: 'Enterprise', slug: 'enterprise', description: 'Unlimited properties for property management companies', price: 150, maxProperties: -1, benefits: ['Unlimited properties', 'Email support'], isActive: true, sortOrder: 2 },
    ])
    professionalId = String(professional._id)
    // The grants production was bootstrapped with before Phase 1.
    await PlanEntitlement.create([
      { planId: String(starter._id), planVersion: 1, featureKey: 'storefront.enabled', value: false },
      { planId: String(starter._id), planVersion: 1, featureKey: 'blog.limit', value: 0 },
      { planId: professionalId, planVersion: 1, featureKey: 'storefront.enabled', value: true },
      { planId: professionalId, planVersion: 1, featureKey: 'storefront.custom_domain', value: false },
      { planId: professionalId, planVersion: 1, featureKey: 'blog.limit', value: 10 },
    ])
    await User.collection.insertOne({ _id: subscriber, email: `phase1-${subscriber}@rentos.test`, roles: ['landlord'], activeRole: 'landlord', subscriptionPackageId: professionalId })
    await Property.collection.insertOne({ title: 'Listed before references existed', status: 'available' })
    await Storefront.collection.insertOne({ slug: 'phase1-homes', name: 'Phase One Homes', ownerType: 'user', ownerId: String(subscriber), status: 'active', contact: { phone: '0241234567', email: 'owner@example.com', whatsapp: '0241234567', address: '12 Oxford St', city: 'Accra', hours: 'Mon–Fri' } })
    await BlogPost.collection.insertOne({ title: 'Old article', slug: 'phase1-old-article', excerpt: 'x', content: 'x', author: 'RentOS Team', published: true, tags: [], createdAt: new Date('2026-03-01') })
  })

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase()
      await mongoose.disconnect()
    }
  })

  it('reports without writing on a dry run', async () => {
    const report = await migratePhase1({ apply: false })
    expect(report.steps.join('\n')).toMatch(/Professional: GH₵50 → GH₵150/)
    expect((await SubscriptionPackage.findOne({ slug: 'professional' }).lean())?.price).toBe(50)
    expect(await PlanEntitlement.findOne({ featureKey: 'storefront.enabled', value: true, planVersion: 1, planId: { $ne: professionalId } }).lean()).toBeNull()
    expect(await Storefront.collection.countDocuments({ 'contact.phone': { $exists: true } })).toBe(1)
  })

  it('applies the new plans and keeps GH₵50 subscribers on the terms they bought', async () => {
    await migratePhase1({ apply: true })

    const starter = await SubscriptionPackage.findOne({ slug: 'starter' }).lean()
    const starterGrants = Object.fromEntries((await PlanEntitlement.find({ planId: String(starter!._id), planVersion: 1 }).lean()).map((g) => [g.featureKey, g.value]))
    expect(starterGrants).toMatchObject({ 'storefront.enabled': true, 'blog.limit': 5, 'storefront.custom_domain': false })
    expect(starter).toMatchObject({ price: 0, isDefault: true, isActive: true })

    const professional = await SubscriptionPackage.findOne({ slug: 'professional' }).lean()
    expect(professional).toMatchObject({ price: 150, maxProperties: -1, version: 2 })
    const v2 = Object.fromEntries((await PlanEntitlement.find({ planId: professionalId, planVersion: 2 }).lean()).map((g) => [g.featureKey, g.value]))
    expect(v2).toMatchObject({ 'storefront.custom_domain': true, 'blog.limit': -1, 'storefront.remove_rentos_branding': true })
    expect(v2['property.limit']).toBeUndefined()
    const v1 = Object.fromEntries((await PlanEntitlement.find({ planId: professionalId, planVersion: 1 }).lean()).map((g) => [g.featureKey, g.value]))
    expect(v1).toMatchObject({ 'property.limit': 10, 'blog.limit': 10, 'storefront.custom_domain': false })
    expect((await User.collection.findOne({ _id: subscriber }))?.subscriptionPlanVersion).toBe(1)

    expect(await SubscriptionPackage.findOne({ slug: 'enterprise' }).lean()).toMatchObject({ isActive: false })

    const property = await Property.collection.findOne({ title: 'Listed before references existed' })
    expect(property?.listingRef).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{7}$/)

    const site = await Storefront.collection.findOne({ slug: 'phase1-homes' })
    expect(site?.contact).toEqual({ city: 'Accra', hours: 'Mon–Fri' })

    const post = await BlogPost.collection.findOne({ slug: 'phase1-old-article' })
    expect(post?.publishedAt).toEqual(new Date('2026-03-01'))

    // The admin switches exist, and are off.
    const switches = await FeatureFlag.find({ key: { $in: ['fees.agreement_signing', 'fees.passport_export', 'listings.direct_whatsapp'] } }).lean()
    expect(switches.map((f) => [f.key, f.enabled]).sort()).toEqual([['fees.agreement_signing', false], ['fees.passport_export', false], ['listings.direct_whatsapp', false]])
  })

  it('changes nothing when run again', async () => {
    const before = await PlanEntitlement.countDocuments()
    const report = await migratePhase1({ apply: true })
    expect(report.steps).toEqual(expect.arrayContaining([
      'Starter: already up to date.',
      'Professional: already on GH₵150 terms.',
      'Enterprise: already closed to new subscribers.',
      'Listings: every property has a reference.',
      'Websites: no private contact details stored.',
      'News: every published post has a publish date.',
      'Switches: already present.',
    ]))
    expect(await PlanEntitlement.countDocuments()).toBe(before)
    expect((await SubscriptionPackage.findOne({ slug: 'professional' }).lean())?.version).toBe(2)
  })
})

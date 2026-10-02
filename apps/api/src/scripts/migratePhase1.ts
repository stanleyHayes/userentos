/**
 * Phase 1 production migration (product brief, October 2026). Safe to re-run:
 * every step checks before it writes, and without --apply it only reports.
 *
 * 1. Plans (brief §08)
 *    - Starter stays free and now includes a website on <name>.userentos.com
 *      and five news posts. Its grants change in place: nobody paid for the
 *      old terms. Whether it is active or the default is left to the admin.
 *    - Professional becomes GH₵150 with unlimited properties, its own domain,
 *      brand and analytics, and unlimited posts. It is published as a new
 *      plan version, so anyone on the GH₵50 terms keeps them: their version
 *      gets an explicit property limit (the plan column now says unlimited),
 *      and subscribers who never had a version recorded are pinned to it.
 *    - Enterprise closes to new subscribers; current subscribers keep it.
 * 2. Listings: every property gets its shareable reference (/property/<ref>).
 * 3. Websites: phone, email, WhatsApp and street address are removed from
 *    website contact details. Enquiries go through RentOS messages (TRUST-2),
 *    and the website editor no longer collects them.
 * 4. News: published posts without a publish date take their creation date,
 *    so the feed orders RentOS and website posts together.
 * 5. Indexes for the new collections and fields (production autoIndex may be off).
 * 6. Admin switches, created OFF so they show on the feature flags page:
 *    the GH₵5 agreement and passport fees (turn on once Paystack is set up)
 *    and the direct WhatsApp button.
 *
 * Usage (no shell needed, e.g. a Render one-off job):
 *   node dist/scripts/migratePhase1.js --apply
 * Locally: npx tsx --env-file=.env src/scripts/migratePhase1.ts [--apply]
 */
import mongoose, { type Model } from 'mongoose'
import { pathToFileURL } from 'node:url'
import { config } from '../config/index.js'
import { SUBSCRIPTION_PACKAGES } from '../data/referenceData.js'
import { DEFAULT_GRANTS } from '../bootstrapPlanEntitlements.js'
import { SubscriptionPackage } from '../models/SubscriptionPackage.js'
import { PlanEntitlement } from '../models/PlanEntitlement.js'
import { User } from '../models/User.js'
import { Property } from '../models/Property.js'
import { Storefront } from '../models/Storefront.js'
import { BlogPost } from '../models/BlogPost.js'
import { TrustDecision } from '../models/TrustDecision.js'
import { Conversation } from '../models/Conversation.js'
import { DeviceToken } from '../models/DeviceToken.js'
import { Lead } from '../models/Lead.js'
import { ContentReport } from '../models/ContentReport.js'
import { FeatureFlag } from '../models/FeatureFlag.js'
import { generateListingRef } from '../services/listings.js'
import { ACTION_FEES } from '../services/actionFees.js'
import { DIRECT_WHATSAPP_FLAG } from '../services/listingContact.js'

export interface MigrationReport {
  apply: boolean
  steps: string[]
}

const reference = (slug: string) => SUBSCRIPTION_PACKAGES.find((p) => p.slug === slug)!

/** Sets grants on one plan version, reporting only the ones that change. */
async function setGrants(planId: string, planVersion: number, grants: Record<string, unknown>, apply: boolean): Promise<string[]> {
  const changed: string[] = []
  for (const [featureKey, value] of Object.entries(grants)) {
    const current = await PlanEntitlement.findOne({ planId, planVersion, featureKey }).lean()
    if (current && JSON.stringify(current.value) === JSON.stringify(value)) continue
    changed.push(`${featureKey}=${JSON.stringify(value)}`)
    if (apply) await PlanEntitlement.updateOne({ planId, planVersion, featureKey }, { $set: { value } }, { upsert: true })
  }
  return changed
}

async function migrateStarter(apply: boolean, steps: string[]) {
  const plan = await SubscriptionPackage.findOne({ slug: 'starter' })
  if (!plan) { steps.push('Starter: no plan with slug "starter"; skipped (seed reference data first).'); return }
  const ref = reference('starter')
  const copyChanged = plan.description !== ref.description || JSON.stringify(plan.benefits) !== JSON.stringify(ref.benefits)
  if (copyChanged && apply) await SubscriptionPackage.updateOne({ _id: plan._id }, { $set: { description: ref.description, benefits: ref.benefits } })
  const grants = await setGrants(String(plan._id), plan.version ?? 1, DEFAULT_GRANTS.starter, apply)
  steps.push(copyChanged || grants.length
    ? `Starter v${plan.version ?? 1}: ${[copyChanged ? 'description and benefits' : '', grants.length ? `grants ${grants.join(', ')}` : ''].filter(Boolean).join('; ')}.`
    : 'Starter: already up to date.')
}

async function migrateProfessional(apply: boolean, steps: string[]) {
  const plan = await SubscriptionPackage.findOne({ slug: 'professional' })
  if (!plan) { steps.push('Professional: no plan with slug "professional"; skipped.'); return }
  const ref = reference('professional')
  const planId = String(plan._id)
  const from = plan.version ?? 1

  if (plan.price === ref.price && plan.maxProperties === ref.maxProperties) {
    // Already on the new terms: make sure its current version carries the new grants.
    const grants = await setGrants(planId, from, DEFAULT_GRANTS.professional, apply)
    steps.push(grants.length ? `Professional v${from}: grants ${grants.join(', ')}.` : 'Professional: already on GH₵150 terms.')
    return
  }

  const to = from + 1
  const oldGrants = await PlanEntitlement.find({ planId, planVersion: from }).lean()
  const unversioned = await User.countDocuments({ subscriptionPackageId: planId, subscriptionPlanVersion: { $exists: false } })
  steps.push(`Professional: GH₵${plan.price} → GH₵${ref.price}, ${plan.maxProperties} → unlimited properties, published as v${to}; v${from} subscribers keep ${plan.maxProperties} properties; ${unversioned} subscriber(s) without a recorded version pinned to v${from}.`)
  if (!apply) return

  // The new version starts from the current terms, then takes the new ones.
  // A property limit on the old version is its own: the new one follows the column.
  for (const grant of oldGrants) {
    if (grant.featureKey === 'property.limit') continue
    await PlanEntitlement.updateOne({ planId, planVersion: to, featureKey: grant.featureKey }, { $setOnInsert: { value: grant.value } }, { upsert: true })
  }
  await setGrants(planId, to, DEFAULT_GRANTS.professional, true)
  // Grandfather v1: the column changes below, so its limit becomes explicit.
  await PlanEntitlement.updateOne({ planId, planVersion: from, featureKey: 'property.limit' }, { $setOnInsert: { value: plan.maxProperties } }, { upsert: true })
  await User.updateMany({ subscriptionPackageId: planId, subscriptionPlanVersion: { $exists: false } }, { $set: { subscriptionPlanVersion: from } })
  await SubscriptionPackage.updateOne({ _id: plan._id }, { $set: { price: ref.price, maxProperties: ref.maxProperties, description: ref.description, benefits: ref.benefits, version: to } })
}

async function migrateEnterprise(apply: boolean, steps: string[]) {
  const plan = await SubscriptionPackage.findOne({ slug: 'enterprise' })
  if (!plan) { steps.push('Enterprise: not present; nothing to retire.'); return }
  if (!plan.isActive) { steps.push('Enterprise: already closed to new subscribers.'); return }
  const subscribers = await User.countDocuments({ subscriptionPackageId: String(plan._id) })
  steps.push(`Enterprise: closed to new subscribers; ${subscribers} current subscriber(s) keep it.`)
  if (apply) await SubscriptionPackage.updateOne({ _id: plan._id }, { $set: { isActive: false, isDefault: false, description: reference('enterprise').description } })
}

async function backfillListingRefs(apply: boolean, steps: string[]) {
  const missing = await Property.collection.find({ $or: [{ listingRef: { $exists: false } }, { listingRef: null }, { listingRef: '' }] }, { projection: { _id: 1 } }).toArray()
  steps.push(missing.length ? `Listings: ${missing.length} without a shareable reference.` : 'Listings: every property has a reference.')
  if (!apply) return
  for (const { _id } of missing) {
    // A clash with the unique index is astronomically unlikely; retry with a fresh reference if it happens.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await Property.collection.updateOne({ _id, $or: [{ listingRef: { $exists: false } }, { listingRef: null }, { listingRef: '' }] }, { $set: { listingRef: generateListingRef() } })
        break
      } catch (err) {
        if ((err as { code?: number }).code !== 11000 || attempt === 4) throw err
      }
    }
  }
}

async function stripWebsiteContacts(apply: boolean, steps: string[]) {
  const filter = { $or: ['phone', 'email', 'whatsapp', 'address'].map((field) => ({ [`contact.${field}`]: { $exists: true } })) }
  const count = await Storefront.collection.countDocuments(filter)
  steps.push(count ? `Websites: removing phone, email, WhatsApp and address from ${count} website(s).` : 'Websites: no private contact details stored.')
  if (apply && count) await Storefront.collection.updateMany(filter, { $unset: { 'contact.phone': '', 'contact.email': '', 'contact.whatsapp': '', 'contact.address': '' } })
}

async function backfillPublishedAt(apply: boolean, steps: string[]) {
  const filter = { published: true, publishedAt: { $exists: false } }
  const count = await BlogPost.collection.countDocuments(filter)
  steps.push(count ? `News: ${count} published post(s) get their creation date as publish date.` : 'News: every published post has a publish date.')
  if (apply && count) await BlogPost.collection.updateMany(filter, [{ $set: { publishedAt: { $ifNull: ['$createdAt', '$$NOW'] } } }])
}

const SWITCHES = [
  { key: ACTION_FEES.agreement_fee.flag, description: 'Charge GH₵5 once per agreement when the tenant signs (unlocks signing and the PDF). Needs a live payment provider.' },
  { key: ACTION_FEES.passport_export.flag, description: 'Charge GH₵5 per rental passport export (PDF or share link). Needs a live payment provider.' },
  { key: DIRECT_WHATSAPP_FLAG, description: "Show a direct WhatsApp button with the agent's own number on listings. Off keeps enquiries on RentOS." },
]

async function createSwitches(apply: boolean, steps: string[]) {
  const existing = new Set((await FeatureFlag.find({ key: { $in: SWITCHES.map((s) => s.key) } }).select('key').lean()).map((f) => f.key))
  const missing = SWITCHES.filter((s) => !existing.has(s.key))
  steps.push(missing.length ? `Switches: creating ${missing.map((s) => s.key).join(', ')} (off).` : 'Switches: already present.')
  if (apply) for (const s of missing) await FeatureFlag.updateOne({ key: s.key }, { $setOnInsert: { key: s.key, description: s.description, enabled: false } }, { upsert: true })
}

async function buildIndexes(apply: boolean, steps: string[]) {
  const models = [TrustDecision, Conversation, DeviceToken, Lead, ContentReport, Property, Storefront, BlogPost] as unknown as Model<never>[]
  steps.push(`Indexes: ${apply ? 'built' : 'would build'} for ${models.map((m) => m.collection.collectionName).join(', ')}.`)
  if (apply) for (const model of models) await model.createIndexes()
}

export async function migratePhase1({ apply }: { apply: boolean }): Promise<MigrationReport> {
  const steps: string[] = []
  await migrateStarter(apply, steps)
  await migrateProfessional(apply, steps)
  await migrateEnterprise(apply, steps)
  await backfillListingRefs(apply, steps)
  await stripWebsiteContacts(apply, steps)
  await backfillPublishedAt(apply, steps)
  await buildIndexes(apply, steps)
  await createSwitches(apply, steps)
  return { apply, steps }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apply = process.argv.includes('--apply')
  await mongoose.connect(config.mongoUri)
  try {
    const report = await migratePhase1({ apply })
    console.log(apply ? 'Phase 1 migration applied:' : 'Phase 1 migration (dry run; pass --apply to write):')
    for (const step of report.steps) console.log(`- ${step}`)
  } finally {
    await mongoose.disconnect()
  }
}

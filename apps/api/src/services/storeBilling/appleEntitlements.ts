import { appleTransactionBlocked } from './appleRevocations.js'
import { ApplePurchase } from '../../models/ApplePurchase.js'
import { StoreProduct } from '../../models/StoreProduct.js'
import { User } from '../../models/User.js'
import { envOptional } from '../../utils/env.js'
import { FEATURE_REGISTRY, isFeatureKey, type StoreEntitlementSnapshot } from '../entitlements.js'
import { snapshotSchema } from './prepareEntitlements.js'
import { StorePurchaseConflict } from './purchaseJournal.js'

function applicationContext() {
  const applicationId = envOptional('APPLE_STORE_BUNDLE_ID')
  const mode = envOptional('APPLE_STORE_ENVIRONMENT')
  if (!applicationId || !['Production', 'Sandbox'].includes(mode ?? '') || (mode === 'Sandbox' && process.env.NODE_ENV === 'production')) return null
  return { applicationId, environment: mode === 'Sandbox' ? 'test' as const : 'production' as const }
}
function eligible(purchase: { providerStatus: number; accessEligible: boolean; revokedAt?: Date | null; upgraded: boolean; purchasedAt: Date; accessExpiresAt?: Date | null }, now: Date) {
  return [1, 4].includes(purchase.providerStatus) && purchase.accessEligible && !purchase.revokedAt && !purchase.upgraded
    && purchase.purchasedAt.getTime() <= now.getTime() && !!purchase.accessExpiresAt && purchase.accessExpiresAt.getTime() > now.getTime()
}
async function requireAccount(userId: string) {
  if (!await User.exists({ _id: userId, deletedAt: { $exists: false }, suspendedAt: { $exists: false }, roles: { $in: ['landlord', 'property_manager'] } })) throw new Error('Account is not eligible for activation')
}
function requireContext(applicationId: string, environment: string, revision: number, now: Date) {
  const context = applicationContext()
  if (!context || context.applicationId !== applicationId || context.environment !== environment) throw new Error('Purchase application or environment is not eligible')
  if (!Number.isInteger(revision) || revision < 1 || !Number.isFinite(now.getTime())) throw new Error('Invalid activation context')
}
export async function prepareAppleEntitlements(userId: string, purchaseId: string, revision: number, now = new Date()) {
  const purchase = await ApplePurchase.findOne({ _id: purchaseId, userId, revision }).lean()
  if (!purchase) throw new StorePurchaseConflict()
  requireContext(purchase.applicationId, purchase.environment, revision, now)
  await requireAccount(userId)
  let preparedGrant = null
  if (eligible(purchase, now) && !await appleTransactionBlocked(purchase)) {
    // Inactive products must still restore using their immutable sold snapshot.
    const mapping = await StoreProduct.findOne({ platform: 'apple', productId: purchase.productId, basePlanId: '' }).lean()
    if (!mapping) throw new Error('Verified product has no RentOS entitlement mapping')
    const parsed = snapshotSchema.safeParse(mapping.entitlementSnapshot)
    if (!parsed.success || parsed.data.planId !== mapping.packageId) throw new Error('Store product entitlement snapshot is invalid')
    for (const [key, value] of Object.entries(parsed.data.features)) {
      if (!isFeatureKey(key) || typeof value !== FEATURE_REGISTRY[key].type) throw new Error('Store product entitlement feature is invalid')
    }
    preparedGrant = { mappingId: mapping._id.toString(), productId: purchase.productId, packageId: mapping.packageId, expiresAt: purchase.accessExpiresAt!, snapshot: parsed.data }
  }
  const updated = await ApplePurchase.findOneAndUpdate({ _id: purchaseId, userId, revision }, { $set: { preparedRevision: revision, preparedGrant, entitlementState: 'prepared' } }, { returnDocument: 'after', runValidators: true }).lean()
  if (!updated) throw new StorePurchaseConflict()
  return updated
}
export async function activateAppleEntitlements(userId: string, purchaseId: string, revision: number, now = new Date()) {
  const filter = { _id: purchaseId, userId, revision, preparedRevision: revision, entitlementState: { $in: ['prepared', 'active', 'revoked'] as const } }
  const purchase = await ApplePurchase.findOne(filter).lean()
  if (!purchase) throw new StorePurchaseConflict()
  requireContext(purchase.applicationId, purchase.environment, revision, now)
  await requireAccount(userId)
  const grant = purchase.preparedGrant
  const active = eligible(purchase, now) && !await appleTransactionBlocked(purchase) && grant && grant.productId === purchase.productId && grant.expiresAt.getTime() > now.getTime()
  const updated = await ApplePurchase.findOneAndUpdate(filter, { $set: { entitlementState: active ? 'active' : 'revoked' } }, { returnDocument: 'after', runValidators: true }).lean()
  if (!updated) throw new StorePurchaseConflict()
  return updated
}
export async function activeAppleSubscription(userId: string, now = new Date()) {
  const context = applicationContext()
  if (!context || !Number.isFinite(now.getTime())) return null
  const purchases = await ApplePurchase.find({ ...context, userId, entitlementState: 'active' }).lean()
  const allowed = []
  for (const purchase of purchases) { if (!await appleTransactionBlocked(purchase)) allowed.push(purchase) }
  const candidates = allowed.flatMap(purchase => {
    const grant = purchase.preparedGrant
    if (!eligible(purchase, now) || purchase.preparedRevision !== purchase.revision || !grant || grant.productId !== purchase.productId || grant.expiresAt.getTime() <= now.getTime()) return []
    return [{ purchaseId: purchase._id.toString(), startedAt: purchase.purchasedAt.getTime(), expiresAt: new Date(Math.min(grant.expiresAt.getTime(), purchase.accessExpiresAt!.getTime())).toISOString(), snapshot: grant.snapshot as StoreEntitlementSnapshot, billingSource: 'app_store' as const }]
  })
  candidates.sort((a, b) => b.startedAt - a.startedAt || Date.parse(b.expiresAt) - Date.parse(a.expiresAt) || a.purchaseId.localeCompare(b.purchaseId))
  return candidates[0] ?? null
}

import { z } from 'zod'
import { isVoidedStoreGrant } from './voidedOrders.js'
import { envOptional } from '../../utils/env.js'
import { StorePurchase } from '../../models/StorePurchase.js'
import { StoreProduct } from '../../models/StoreProduct.js'
import { User } from '../../models/User.js'
import { FEATURE_REGISTRY, isFeatureKey } from '../entitlements.js'
import { StorePurchaseConflict } from './purchaseJournal.js'

export const snapshotSchema = z.object({
  planId: z.string().min(1), planName: z.string().min(1), planVersion: z.number().int().positive(),
  billingCycle: z.enum(['monthly', 'yearly']), benefits: z.array(z.string()),
  features: z.record(z.string(), z.union([z.boolean(), z.number().finite(), z.string()])),
}).strict()

/** Read old catalogue entries for restorations even when no longer on sale. */
export async function prepareGoogleEntitlements(userId: string, purchaseId: string, expectedRevision: number, now = new Date()) {
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(expectedRevision) || expectedRevision < 1) throw new Error('Invalid entitlement preparation context')
  const purchase = await StorePurchase.findOne({ _id: purchaseId, userId, platform: 'google', revision: expectedRevision }).lean()
  if (!purchase) throw new StorePurchaseConflict()
  if (purchase.applicationId !== envOptional('GOOGLE_PLAY_PACKAGE_NAME')) throw new Error('Purchase belongs to a different application')
  if (purchase.environment === 'test' && (process.env.NODE_ENV === 'production' || envOptional('GOOGLE_PLAY_ALLOW_TEST_PURCHASES') !== 'true')) throw new Error('Test purchase cannot prepare live entitlements')
  const eligibleUser = await User.exists({ _id: userId, deletedAt: { $exists: false }, suspendedAt: { $exists: false }, roles: { $in: ['landlord', 'property_manager'] } })
  if (!eligibleUser) throw new Error('Account is not eligible for a property subscription')
  const allowState = ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED'].includes(purchase.providerState)
  const startedAt = purchase.startedAt ? Date.parse(purchase.startedAt) : NaN
  const eligible = purchase.items.filter(item => !isVoidedStoreGrant(purchase, item) && allowState && Number.isFinite(startedAt) && startedAt <= now.getTime()
    && item.accessEligible === true && item.expiresAt && Date.parse(item.expiresAt) > now.getTime())
  const grants = []
  for (const item of eligible) {
    const mapping = await StoreProduct.findOne({ platform: 'google', productId: item.productId, basePlanId: item.basePlanId }).lean()
    if (!mapping) throw new Error('Verified product has no RentOS entitlement mapping')
    const parsed = snapshotSchema.safeParse(mapping.entitlementSnapshot)
    if (!parsed.success || parsed.data.planId !== mapping.packageId) throw new Error('Store product entitlement snapshot is invalid')
    for (const [key, value] of Object.entries(parsed.data.features)) {
      if (!isFeatureKey(key) || typeof value !== FEATURE_REGISTRY[key].type) throw new Error('Store product entitlement feature is invalid')
    }
    grants.push({ productId: item.productId, basePlanId: item.basePlanId, mappingId: mapping._id.toString(), packageId: mapping.packageId, expiresAt: item.expiresAt!, snapshot: parsed.data })
  }
  // This records a prepared set, not an activated User entitlement. A new
  // provider observation clears it and requires preparation at its new revision.
  const prepared = await StorePurchase.findOneAndUpdate({ _id: purchaseId, userId, revision: expectedRevision }, {
    $set: { preparedGrants: grants, preparedRevision: expectedRevision, entitlementState: 'prepared' },
  }, { returnDocument: 'after', runValidators: true }).lean()
  if (!prepared) throw new StorePurchaseConflict()
  return prepared
}

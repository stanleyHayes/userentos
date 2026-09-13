import { activeAppleSubscription } from './appleEntitlements.js'
import { currentPaidSubscription, type Subscriber } from '../payments/paidSubscription.js'
import { isVoidedStoreGrant } from './voidedOrders.js'
import { StorePurchase } from '../../models/StorePurchase.js'
import { User } from '../../models/User.js'
import { envOptional } from '../../utils/env.js'
import type { StoreEntitlementSnapshot } from '../entitlements.js'
import { StorePurchaseConflict } from './purchaseJournal.js'

function environments(): Array<'production' | 'test'> {
  return process.env.NODE_ENV !== 'production' && envOptional('GOOGLE_PLAY_ALLOW_TEST_PURCHASES') === 'true' ? ['production', 'test'] : ['production']
}

export async function activateGoogleEntitlements(userId: string, purchaseId: string, revision: number, now = new Date()) {
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(revision) || revision < 1) throw new Error('Invalid activation context')
  const purchase = await StorePurchase.findOne({ _id: purchaseId, userId, platform: 'google', revision, preparedRevision: revision, entitlementState: { $in: ['prepared', 'active', 'revoked'] } }).lean()
  if (!purchase) throw new StorePurchaseConflict()
  if (purchase.applicationId !== envOptional('GOOGLE_PLAY_PACKAGE_NAME') || !environments().includes(purchase.environment)) throw new Error('Purchase application or environment is not eligible')
  if (!await User.exists({ _id: userId, deletedAt: { $exists: false }, suspendedAt: { $exists: false }, roles: { $in: ['landlord', 'property_manager'] } })) throw new Error('Account is not eligible for activation')
  const providerEligible = ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED'].includes(purchase.providerState)
  const active = providerEligible && !!purchase.startedAt && Date.parse(purchase.startedAt) <= now.getTime() && purchase.preparedGrants.some(grant => !isVoidedStoreGrant(purchase, grant) && Date.parse(grant.expiresAt) > now.getTime())
  const replacement = active ? purchase.linkedPurchaseTokenHash : null
  if (replacement === purchase.tokenHash || (replacement && purchase.supersedesTokenHash && replacement !== purchase.supersedesTokenHash)) throw new Error('Invalid purchase replacement chain')
  const updated = await StorePurchase.findOneAndUpdate({ _id: purchaseId, userId, revision, preparedRevision: revision }, { $set: {
    entitlementState: active ? 'active' : 'revoked',
    ...(replacement ? { supersedesTokenHash: replacement } : {}),
  } }, { returnDocument: 'after', runValidators: true }).lean()
  if (!updated) throw new StorePurchaseConflict()
  return updated
}

/** Single-plan product: most recently started valid store subscription wins.
 * Replacement markers survive subsequent revocation and apply across accounts.
 */
export async function activeStoreSubscription(userId: string, now = new Date()) {
  const applicationId = envOptional('GOOGLE_PLAY_PACKAGE_NAME')
  if (!applicationId) return null
  const purchases = await StorePurchase.find({ userId, platform: 'google', applicationId, environment: { $in: environments() }, entitlementState: 'active' }).lean()
  if (!purchases.length) return null
  const replacements = await StorePurchase.find({ platform: 'google', applicationId, supersedesTokenHash: { $in: purchases.map(purchase => purchase.tokenHash) } }).select('supersedesTokenHash environment').lean()
  const candidates = purchases.flatMap(purchase => {
    if (purchase.preparedRevision !== purchase.revision || replacements.some(replacement => replacement.environment === purchase.environment && replacement.supersedesTokenHash === purchase.tokenHash)) return []
    const startedAt = purchase.startedAt ? Date.parse(purchase.startedAt) : NaN
    if (!Number.isFinite(startedAt) || startedAt > now.getTime()) return []
    return purchase.preparedGrants.filter(grant => !isVoidedStoreGrant(purchase, grant) && Date.parse(grant.expiresAt) > now.getTime()).map(grant => ({
      purchaseId: purchase._id.toString(), startedAt, expiresAt: grant.expiresAt,
      snapshot: grant.snapshot as StoreEntitlementSnapshot, billingSource: 'google_play' as const,
    }))
  })
  candidates.sort((a, b) => b.startedAt - a.startedAt || Date.parse(b.expiresAt) - Date.parse(a.expiresAt) || a.purchaseId.localeCompare(b.purchaseId))
  return candidates[0] ?? null
}

export async function effectiveStoreSubscription(userId: string, legacy: Subscriber & { suspendedAt?: Date }, now = new Date()) {
  if (legacy.suspendedAt) return null
  const candidates = (await Promise.all([activeStoreSubscription(userId, now), activeAppleSubscription(userId, now)])).filter(value => value !== null)
  candidates.sort((a, b) => b.startedAt - a.startedAt || Date.parse(b.expiresAt) - Date.parse(a.expiresAt) || a.purchaseId.localeCompare(b.purchaseId))
  const store = candidates[0] ?? null
  const paid = await currentPaidSubscription(legacy, now)
  const legacyActive = (paid ? paid.active : true) && legacy.subscriptionPackageId && (!legacy.subscriptionEndDate || new Date(legacy.subscriptionEndDate).getTime() > now.getTime())
  return store && (!legacyActive || !legacy.subscriptionStartDate || store.startedAt >= new Date(legacy.subscriptionStartDate).getTime()) ? store : null
}

import { createHash } from 'node:crypto'
import { ApplePurchase } from '../../models/ApplePurchase.js'
import { User } from '../../models/User.js'
import { appleTransactionIdInput, verifyAppleSubscription, verifyAppleTransaction } from './appleStore.js'
import { StorePurchaseAccessError, StorePurchaseConflict } from './purchaseJournal.js'
import { encryptStoreToken } from './tokenVault.js'

export function appleTransactionHash(transactionId: string) {
  return createHash('sha256').update(`rentos:apple:${transactionId}`).digest('hex')
}
export function appleTokenContext(applicationId: string, environment: string, originalTransactionHash: string, userId: string) {
  return JSON.stringify(['apple', applicationId, environment, originalTransactionHash, userId])
}

/** An initial verified transaction resolves the chain identity. Read the journal
 * revision BEFORE requesting current status so concurrent responses cannot write
 * over a newer observation. A conflict requires a fresh provider verification.
 */
export async function recordApplePurchase(userId: string, transactionId: string) {
  if (!appleTransactionIdInput.safeParse(transactionId).success) throw new Error('Invalid transaction ID')
  const accountFilter = { _id: userId, deletedAt: { $exists: false }, suspendedAt: { $exists: false } }
  const user = await User.findOne(accountFilter).select('+storeAccountToken').lean()
  if (!user?.storeAccountToken) throw new StorePurchaseAccessError('account_binding')
  const anchor = await verifyAppleTransaction(transactionId, user.storeAccountToken)
  const identity = { applicationId: anchor.applicationId, environment: anchor.environment, originalTransactionHash: appleTransactionHash(anchor.originalTransactionId) }
  const previous = await ApplePurchase.findOne(identity).lean()
  if (previous && previous.userId !== userId) throw new StorePurchaseAccessError('ownership')
  const originalTransactionCiphertext = encryptStoreToken(anchor.originalTransactionId, appleTokenContext(identity.applicationId, identity.environment, identity.originalTransactionHash, userId))
  const verified = await verifyAppleSubscription(transactionId, user.storeAccountToken)
  if (verified.applicationId !== anchor.applicationId || verified.environment !== anchor.environment || verified.originalTransactionId !== anchor.originalTransactionId || verified.subscriptionGroupId !== anchor.subscriptionGroupId) throw new Error('Purchase identity changed during verification')
  // Closure/suspension or a changed binding during slow provider calls must not
  // produce a new successful observation. Activation must check again itself.
  if (!await User.exists({ ...accountFilter, storeAccountToken: user.storeAccountToken })) throw new StorePurchaseAccessError('account_binding')
  const observation = {
    originalTransactionCiphertext, transactionHash: appleTransactionHash(verified.transactionId),
    productId: verified.productId, subscriptionGroupId: verified.subscriptionGroupId,
    providerStatus: verified.status, purchasedAt: new Date(verified.purchasedAt), originalPurchasedAt: new Date(verified.originalPurchasedAt),
    expiresAt: new Date(verified.expiresAt), signedAt: new Date(verified.signedAt), verifiedAt: new Date(verified.verifiedAt),
    revokedAt: verified.revokedAt ? new Date(verified.revokedAt) : null,
    upgraded: verified.upgraded, autoRenewing: verified.autoRenewing,
    graceExpiresAt: verified.graceExpiresAt ? new Date(verified.graceExpiresAt) : null,
    accessExpiresAt: verified.accessExpiresAt ? new Date(verified.accessExpiresAt) : null,
    accessEligible: verified.accessEligible, entitlementState: 'pending' as const,
  }
  if (previous) {
    const updated = await ApplePurchase.findOneAndUpdate({ ...identity, userId, revision: previous.revision }, { $set: observation, $unset: { preparedRevision: 1, preparedGrant: 1 }, $inc: { revision: 1 } }, { returnDocument: 'after', runValidators: true }).lean()
    if (!updated) throw new StorePurchaseConflict()
    return updated
  }
  try {
    const created = await ApplePurchase.create({ ...identity, userId, ...observation, revision: 1 })
    return await ApplePurchase.findById(created._id).lean()
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new StorePurchaseConflict()
    throw error
  }
}

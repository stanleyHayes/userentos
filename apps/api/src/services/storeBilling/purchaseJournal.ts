import { User } from '../../models/User.js'
import { StorePurchase } from '../../models/StorePurchase.js'
import { purchaseAccountIdentifiers } from './catalog.js'
import { googlePlayApplicationId, googlePurchaseTokenInput, purchaseTokenHash, verifyGoogleSubscription } from './googlePlay.js'
import { encryptStoreToken } from './tokenVault.js'

export class StorePurchaseConflict extends Error {
  constructor() { super('Purchase changed during verification; verify again before applying it') }
}
export class StorePurchaseAccessError extends Error {
  constructor(public readonly reason: 'account_binding' | 'ownership') {
    super(reason === 'ownership' ? 'Purchase belongs to another account' : 'Purchase account binding unavailable')
  }
}
export function storeTokenContext(applicationId: string, tokenHash: string, userId: string) {
  return JSON.stringify(['google', applicationId, tokenHash, userId])
}

/** Persist a provider-verified observation. No entitlement or acknowledgement
 * is performed here. Reconciliation must re-verify after a revision conflict.
 */
export async function recordGooglePurchase(userId: string, purchaseToken: string) {
  if (!googlePurchaseTokenInput.safeParse(purchaseToken).success) throw new Error('Invalid purchase token')
  const user = await User.findOne({ _id: userId, deletedAt: { $exists: false }, suspendedAt: { $exists: false } }).select('+storeAccountToken').lean()
  if (!user?.storeAccountToken) throw new StorePurchaseAccessError('account_binding')
  const applicationId = googlePlayApplicationId()
  const tokenHash = purchaseTokenHash(purchaseToken)
  const identity = { platform: 'google' as const, applicationId, tokenHash }
  const previous = await StorePurchase.findOne(identity).lean()
  if (previous && previous.userId !== userId) throw new StorePurchaseAccessError('ownership')
  const tokenCiphertext = encryptStoreToken(purchaseToken, storeTokenContext(applicationId, tokenHash, userId))
  const verified = await verifyGoogleSubscription(purchaseToken, purchaseAccountIdentifiers(user.storeAccountToken).obfuscatedAccountId, userId)
  if (verified.packageName !== applicationId || verified.purchaseTokenHash !== tokenHash) throw new Error('Purchase identity changed during verification')
  const observation = {
    tokenCiphertext,
    providerState: verified.state, environment: verified.environment,
    acknowledged: verified.acknowledged, startedAt: verified.startedAt,
    verifiedAt: new Date(verified.verifiedAt), linkedPurchaseTokenHash: verified.linkedPurchaseTokenHash,
    items: verified.items, entitlementState: 'pending' as const, preparedGrants: [],
  }
  if (previous) {
    const updated = await StorePurchase.findOneAndUpdate({ ...identity, userId, revision: previous.revision }, {
      $set: observation, $unset: { preparedRevision: 1 }, $inc: { revision: 1 },
    }, { returnDocument: 'after', runValidators: true }).lean()
    if (!updated) throw new StorePurchaseConflict()
    return updated
  }
  try {
    const created = await StorePurchase.create({ ...identity, userId, ...observation, revision: 1 })
    // Do not return the in-memory create document: select:false only applies
    // to queries, so it still contains tokenCiphertext.
    return await StorePurchase.findById(created._id).lean()
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new StorePurchaseConflict()
    throw error
  }
}

import { StorePurchase } from '../../models/StorePurchase.js'
import { activateGoogleEntitlements } from './activeEntitlements.js'
import { acknowledgeGoogleSubscription } from './googlePlay.js'
import { prepareGoogleEntitlements } from './prepareEntitlements.js'
import { recordGooglePurchase, StorePurchaseConflict } from './purchaseJournal.js'

/** Retry from verification after any interruption. Google is authoritative for
 * acknowledgement, including when the previous POST succeeded but its response
 * or the local write was lost. No raw provider response or token is returned.
 */
export async function completeGooglePurchase(userId: string, purchaseToken: string) {
  const purchase = await recordGooglePurchase(userId, purchaseToken)
  if (!purchase) throw new StorePurchaseConflict()
  const purchaseId = purchase._id.toString()
  await prepareGoogleEntitlements(userId, purchaseId, purchase.revision)
  const activated = await activateGoogleEntitlements(userId, purchaseId, purchase.revision)
  if (!activated.acknowledged && activated.entitlementState === 'active') {
    const productId = activated.preparedGrants[0]?.productId
    if (!productId) throw new Error('Active purchase has no prepared product')
    await acknowledgeGoogleSubscription(purchaseToken, productId)
    const saved = await StorePurchase.updateOne({ _id: purchaseId, userId, revision: purchase.revision, preparedRevision: purchase.revision, entitlementState: 'active' }, { $set: { acknowledged: true } })
    if (!saved.matchedCount) throw new StorePurchaseConflict()
  }
  return { purchaseId, revision: purchase.revision, purchaseState: activated.providerState, entitlementState: activated.entitlementState, acknowledged: activated.acknowledged || activated.entitlementState === 'active' }
}

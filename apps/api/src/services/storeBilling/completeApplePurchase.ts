import { recordApplePurchase } from './applePurchaseJournal.js'
import { prepareAppleEntitlements, activateAppleEntitlements } from './appleEntitlements.js'
import { StorePurchaseConflict } from './purchaseJournal.js'

/** Retry the complete sequence after interruption, always starting with fresh
 * provider verification. StoreKit transaction finishing remains client-owned.
 */
export async function completeApplePurchase(userId: string, transactionId: string) {
  const purchase = await recordApplePurchase(userId, transactionId)
  if (!purchase) throw new StorePurchaseConflict()
  const purchaseId = purchase._id.toString()
  await prepareAppleEntitlements(userId, purchaseId, purchase.revision)
  const activated = await activateAppleEntitlements(userId, purchaseId, purchase.revision)
  return { purchaseId, revision: purchase.revision, purchaseState: activated.providerStatus, entitlementState: activated.entitlementState }
}

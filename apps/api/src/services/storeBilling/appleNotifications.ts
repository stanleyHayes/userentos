import { recordAppleRevocation } from './appleRevocations.js'
import { ApplePurchase } from '../../models/ApplePurchase.js'
import { StoreNotification } from '../../models/StoreNotification.js'
import { appleNotificationInput, verifyAppleNotification } from './appleStore.js'
import { appleTransactionHash } from './applePurchaseJournal.js'
import { completeApplePurchase } from './completeApplePurchase.js'
import { appleEnvironmentsFor } from './storeEnvironments.js'

export class AppleNotificationError extends Error {
  constructor(public readonly status: number) { super('Apple notification could not be processed') }
}
const lifecycleEvents = new Set(['SUBSCRIBED', 'DID_CHANGE_RENEWAL_PREF', 'DID_CHANGE_RENEWAL_STATUS', 'OFFER_REDEEMED', 'DID_RENEW', 'EXPIRED', 'DID_FAIL_TO_RENEW', 'GRACE_PERIOD_EXPIRED', 'PRICE_INCREASE', 'PRICE_CHANGE', 'REFUND', 'REFUND_DECLINED', 'REFUND_REVERSED', 'RENEWAL_EXTENDED', 'REVOKE'])

/** Acknowledge only after fresh owner-bound reconciliation and durable dedup.
 * Notification state is historical; never use it to overwrite current access.
 */
export async function processAppleNotification(body: unknown) {
  const parsed = appleNotificationInput.safeParse(body)
  if (!parsed.success) throw new AppleNotificationError(400)
  const event = await verifyAppleNotification(parsed.data.signedPayload)
  const delivery = { subscription: JSON.stringify(['apple', event.applicationId, event.environment]), messageId: event.notificationId }
  if (await StoreNotification.exists(delivery)) return
  if (event.notificationType !== 'TEST') {
    if (!lifecycleEvents.has(event.notificationType) || !event.transaction) throw new AppleNotificationError(503)
    await recordAppleRevocation(event)
    const purchase = await ApplePurchase.findOne({ applicationId: event.applicationId, environment: event.environment, originalTransactionHash: appleTransactionHash(event.transaction.originalTransactionId) }).select('userId').lean()
    // Delivery can precede device registration. Retry rather than inventing an owner.
    if (!purchase) throw new AppleNotificationError(503)
    // A sandbox chain whose owner may no longer hold test purchases grants
    // nothing (every reader skips it), so acknowledge instead of reconciling.
    const retired = event.environment === 'test' && !appleEnvironmentsFor(purchase.userId).includes('test')
    if (!retired) await completeApplePurchase(purchase.userId, event.transaction.transactionId)
  }
  try { await StoreNotification.create(delivery) } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error
  }
}

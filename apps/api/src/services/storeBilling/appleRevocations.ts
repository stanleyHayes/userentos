import { AppleTransactionRevocation } from '../../models/AppleTransactionRevocation.js'
import { appleTransactionHash } from './applePurchaseJournal.js'
import type { verifyAppleNotification } from './appleStore.js'

/** Only call with an authenticated notification. Signed event order, not delivery
 * order, decides the transaction override. Revocation wins equal-time conflicts.
 */
export async function recordAppleRevocation(event: Awaited<ReturnType<typeof verifyAppleNotification>>) {
  if (!event.transaction || !['REFUND', 'REVOKE', 'REFUND_REVERSED'].includes(event.notificationType)) return
  const signedAt = new Date(event.signedAt)
  const revoked = event.notificationType !== 'REFUND_REVERSED'
  const identity = { applicationId: event.applicationId, environment: event.environment, transactionHash: appleTransactionHash(event.transaction.transactionId) }
  const incomingWins = { $or: [{ $eq: [{ $type: '$signedAt' }, 'missing'] }, { $lt: ['$signedAt', signedAt] }, { $and: [{ $eq: ['$signedAt', signedAt] }, revoked, { $ne: ['$revoked', true] }] }] }
  const update = [{ $set: {
    revoked: { $cond: [incomingWins, revoked, '$revoked'] },
    signedAt: { $cond: [incomingWins, signedAt, '$signedAt'] },
    observedAt: { $cond: [incomingWins, new Date(), '$observedAt'] },
  } }]
  try { await AppleTransactionRevocation.updateOne(identity, update, { upsert: true, updatePipeline: true }) } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error
    // Concurrent first insert: apply the same monotonic conditional to its winner.
    await AppleTransactionRevocation.updateOne(identity, update, { updatePipeline: true })
  }
}
export async function appleTransactionBlocked(purchase: { applicationId: string; environment: 'production' | 'test'; transactionHash: string; verifiedAt: Date }) {
  const record = await AppleTransactionRevocation.findOne({ applicationId: purchase.applicationId, environment: purchase.environment, transactionHash: purchase.transactionHash }).lean()
  // A reversal removes the override only after another provider verification.
  return !!record && (record.revoked || purchase.verifiedAt.getTime() <= record.observedAt.getTime())
}

import { randomUUID } from 'node:crypto'
import { StorePurchase } from '../../models/StorePurchase.js'
import { envOptional } from '../../utils/env.js'
import { completeGooglePurchase } from './completePurchase.js'
import { googlePlayApplicationId, purchaseTokenHash, StoreVerificationError } from './googlePlay.js'
import { storeTokenContext, StorePurchaseConflict } from './purchaseJournal.js'
import { googleRecoveryScope } from './storeEnvironments.js'
import { decryptStoreToken } from './tokenVault.js'

const MINUTE = 60_000
/** Bounded recovery and lifecycle polling. Each row has an expiring fenced lease,
 * so overlapping workers do not own the same attempt and a crash can recover.
 * Polling is a fallback; real-time notifications still need to trigger immediate verification.
 * License-test rows are polled only for accounts still allowed to hold them.
 */
export async function recoverGooglePurchases(limit = 20) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid recovery batch size')
  if (!envOptional('GOOGLE_PLAY_SERVICE_ACCOUNT_FILE') || !envOptional('GOOGLE_PLAY_PACKAGE_NAME') || !envOptional('STORE_BILLING_ENCRYPTION_KEY')) return { processed: 0, failed: 0, skipped: true }
  const applicationId = googlePlayApplicationId()
  const scope = googleRecoveryScope()
  let processed = 0
  let failed = 0
  for (let index = 0; index < limit; index++) {
    const now = new Date()
    const leaseId = randomUUID()
    const purchase = await StorePurchase.findOneAndUpdate({
      platform: 'google', applicationId, ...scope,
      $and: [
        { $or: [{ entitlementState: { $in: ['pending', 'prepared'] } }, { providerState: { $in: ['SUBSCRIPTION_STATE_PENDING', 'SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED', 'SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_PAUSED'] } }] },
        { $or: [{ recoveryNextAttemptAt: { $exists: false } }, { recoveryNextAttemptAt: { $lte: now } }] },
        { $or: [{ recoveryLeaseUntil: { $exists: false } }, { recoveryLeaseUntil: { $lte: now } }] },
      ],
    }, { $set: { recoveryLeaseId: leaseId, recoveryLeaseUntil: new Date(now.getTime() + 5 * MINUTE) }, $inc: { recoveryAttempts: 1 } }, { returnDocument: 'after', sort: { recoveryNextAttemptAt: 1, createdAt: 1 } }).select('+tokenCiphertext').lean()
    if (!purchase) break
    processed++
    let errorCode: string | undefined
    try {
      const token = decryptStoreToken(purchase.tokenCiphertext, storeTokenContext(applicationId, purchase.tokenHash, purchase.userId))
      if (purchaseTokenHash(token) !== purchase.tokenHash) throw new Error('Invalid stored token')
      await completeGooglePurchase(purchase.userId, token)
    } catch (error) {
      failed++
      errorCode = error instanceof StoreVerificationError ? error.code : error instanceof StorePurchaseConflict ? 'revision_conflict' : 'completion_failed'
    }
    // Never log or persist the original exception: it may carry receipt data.
    // Exponential backoff caps at one hour; successful incomplete states also
    // wait before another attempt. Only the current lease holder can release it.
    const delay = errorCode ? Math.min(60, 2 ** Math.min(purchase.recoveryAttempts, 6)) * MINUTE : 5 * MINUTE
    await StorePurchase.updateOne({ _id: purchase._id, recoveryLeaseId: leaseId }, {
      $set: { recoveryNextAttemptAt: new Date(Date.now() + delay), ...(errorCode ? { recoveryLastError: errorCode } : { recoveryAttempts: 0 }) },
      $unset: { recoveryLeaseId: 1, recoveryLeaseUntil: 1, ...(!errorCode ? { recoveryLastError: 1 } : {}) },
    })
  }
  return { processed, failed, skipped: false }
}

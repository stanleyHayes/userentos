import { randomUUID } from 'node:crypto'
import { ApplePurchase } from '../../models/ApplePurchase.js'
import { envOptional } from '../../utils/env.js'
import { completeApplePurchase } from './completeApplePurchase.js'
import { StoreVerificationError } from './googlePlay.js'
import { StorePurchaseConflict } from './purchaseJournal.js'
import { appleRecoveryScope, appleStoreMode } from './storeEnvironments.js'
import { decryptStoreToken } from './tokenVault.js'

import { appleTransactionHash, appleTokenContext } from './applePurchaseJournal.js'

const MINUTE = 60_000
/** Bounded recovery and lifecycle polling. Each row has an expiring fenced lease,
 * so overlapping workers do not own the same attempt and a crash can recover.
 * Polling is a fallback; real-time notifications still need to trigger immediate verification.
 * Sandbox rows are polled only for accounts still allowed to hold them.
 */
export async function recoverApplePurchases(limit = 20) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid recovery batch size')
  const mode = appleStoreMode()
  const scope = appleRecoveryScope()
  if (!mode || !scope || !envOptional('APPLE_STORE_PRIVATE_KEY_FILE') || !envOptional('STORE_BILLING_ENCRYPTION_KEY')) return { processed: 0, failed: 0, skipped: true }
  const { applicationId } = mode
  let processed = 0
  let failed = 0
  for (let index = 0; index < limit; index++) {
    const now = new Date()
    const leaseId = randomUUID()
    const purchase = await ApplePurchase.findOneAndUpdate({
      applicationId, ...scope,
      $and: [
        { $or: [{ entitlementState: { $in: ['pending', 'prepared'] } }, { providerStatus: { $in: [1, 3, 4] } }] },
        { $or: [{ recoveryNextAttemptAt: { $exists: false } }, { recoveryNextAttemptAt: { $lte: now } }] },
        { $or: [{ recoveryLeaseUntil: { $exists: false } }, { recoveryLeaseUntil: { $lte: now } }] },
      ],
    }, { $set: { recoveryLeaseId: leaseId, recoveryLeaseUntil: new Date(now.getTime() + 5 * MINUTE) }, $inc: { recoveryAttempts: 1 } }, { returnDocument: 'after', sort: { recoveryNextAttemptAt: 1, createdAt: 1 } }).select('+originalTransactionCiphertext').lean()
    if (!purchase) break
    processed++
    let errorCode: string | undefined
    try {
      const token = decryptStoreToken(purchase.originalTransactionCiphertext, appleTokenContext(applicationId, purchase.environment, purchase.originalTransactionHash, purchase.userId))
      if (appleTransactionHash(token) !== purchase.originalTransactionHash) throw new Error('Invalid stored token')
      await completeApplePurchase(purchase.userId, token)
    } catch (error) {
      failed++
      errorCode = error instanceof StoreVerificationError ? error.code : error instanceof StorePurchaseConflict ? 'revision_conflict' : 'completion_failed'
    }
    // Never log or persist the original exception: it may carry receipt data.
    // Exponential backoff caps at one hour; successful incomplete states also
    // wait before another attempt. Only the current lease holder can release it.
    const delay = errorCode ? Math.min(60, 2 ** Math.min(purchase.recoveryAttempts, 6)) * MINUTE : 5 * MINUTE
    await ApplePurchase.updateOne({ _id: purchase._id, recoveryLeaseId: leaseId }, {
      $set: { recoveryNextAttemptAt: new Date(Date.now() + delay), ...(errorCode ? { recoveryLastError: errorCode } : { recoveryAttempts: 0 }) },
      $unset: { recoveryLeaseId: 1, recoveryLeaseUntil: 1, ...(!errorCode ? { recoveryLastError: 1 } : {}) },
    })
  }
  return { processed, failed, skipped: false }
}

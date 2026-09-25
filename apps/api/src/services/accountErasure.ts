import { eraseAvatars } from './avatarStorage.js'
import { erasePersonalDocuments } from './documentErasure.js'
import { User } from '../models/User.js'
import { RefreshToken } from '../models/RefreshToken.js'
import { BiometricToken } from '../models/BiometricToken.js'
import { DeviceToken } from '../models/DeviceToken.js'
import { Notification } from '../models/Notification.js'
import { TenantProfile } from '../models/TenantProfile.js'
import { ProfileAccess } from '../models/ProfileAccess.js'
import { Favorite } from '../models/Favorite.js'
import { CreditScore } from '../models/CreditScore.js'
import { Review } from '../models/Review.js'
import { Conversation, Message } from '../models/Conversation.js'
import { logger } from '../utils/logger.js'
import { UserBlock } from '../models/UserBlock.js'
import { Achievement } from '../models/Achievement.js'
import { PaymentStreak } from '../models/PaymentStreak.js'

export const ACCOUNT_ERASURE_DELAY_MS = 30 * 24 * 60 * 60 * 1000

/** Idempotent cleanup. Retain the account tombstone until every operation succeeds. */
export async function eraseAccountRecords(uid: string, cutoff: Date): Promise<boolean> {
  // Recheck eligibility before touching related data, including on manual/retry calls.
  if (!(await User.exists({ _id: uid, deletedAt: { $lt: cutoff } }))) return false
  await eraseAvatars(uid)
  await erasePersonalDocuments(uid)
  const operations: Array<() => PromiseLike<unknown>> = [
    () => UserBlock.deleteMany({ $or: [{ blockerId: uid }, { blockedId: uid }] }),
    () => RefreshToken.deleteMany({ userId: uid }),
    () => BiometricToken.deleteMany({ userId: uid }),
    () => DeviceToken.deleteMany({ userId: uid }),
    () => Notification.deleteMany({ userId: uid }),
    () => TenantProfile.deleteMany({ userId: uid }),
    () => ProfileAccess.deleteMany({ $or: [{ requesterId: uid }, { tenantId: uid }] }),
    () => Favorite.deleteMany({ userId: uid }),
    () => CreditScore.deleteMany({ userId: uid }),
    // Badges and streaks are derived engagement data with no retention need.
    () => Achievement.deleteMany({ userId: uid }),
    () => PaymentStreak.deleteMany({ userId: uid }),
    () => Message.deleteMany({ senderId: uid }),
    () => Review.updateMany({ userId: uid }, { $set: { userName: 'Deleted User' } }),
    // The preview duplicates message text, so removing Message alone leaks it.
    () => Conversation.updateMany({ 'lastMessage.senderId': uid }, { $unset: { lastMessage: 1 } }),
    () => Conversation.updateMany({ participants: uid }, {
      $pull: { participants: uid }, $unset: { [`unreadCount.${uid}`]: 1 },
    }),
  ]
  // All settlements must complete before a retry or account removal. Promise.all
  // rejects early while sibling writes may still be running.
  const results = await Promise.allSettled(operations.map(operation => Promise.resolve().then(operation)))
  if (results.some(result => result.status === 'rejected')) {
    throw new Error('Account cleanup incomplete; account retained for retry')
  }
  // Financial and contract records remain identifiable personal data; deleting
  // the User does NOT make signed names, payment metadata or contracts anonymous.
  // WalletCredit journals also remain: their immutable keys prevent a replayed
  // financial operation from crediting twice after wallet display history rolls off.
  // Final statutory retention/disposal periods still require the compliance review.
  const purged = await User.deleteOne({ _id: uid, deletedAt: { $lt: cutoff } })
  return purged.deletedCount !== 0
}

/** Bounded pages with keyset traversal: one failing account cannot starve later ones. */
export async function purgeExpiredAccounts(now = new Date()) {
  const cutoff = new Date(now.getTime() - ACCOUNT_ERASURE_DELAY_MS)
  const summary = { removed: 0, failed: 0, skipped: 0 }
  let after: string | undefined
  for (;;) {
    const users = await User.find({ deletedAt: { $lt: cutoff }, ...(after ? { _id: { $gt: after } } : {}) })
      .select('_id').sort({ _id: 1 }).limit(100).lean()
    if (users.length === 0) break
    for (const user of users) {
      const uid = String(user._id)
      try {
        if (await eraseAccountRecords(uid, cutoff)) summary.removed++
        else summary.skipped++
      } catch {
        summary.failed++
        logger.warn(`[Account erasure] Cleanup pending for account ${uid}; will retry on the next run`)
      }
      after = uid
    }
  }
  logger.info('[Account erasure] Cleanup completed', summary)
  return summary
}

import { randomUUID } from 'node:crypto'
import { eraseAvatars } from './avatarStorage.js'
import { erasePersonalDocuments } from './documentErasure.js'
import { propertyImageAssets, eraseStoredAssets } from './propertyImages.js'
import { releaseStorefrontDomains } from './accountClosure.js'
import { markAccountErasureComplete } from './erasureLedger.js'
import { NEW_LEAD_TITLE, VIEWING_REQUESTED_TITLE, newLeadMessage, viewingRequestedMessage, legacyLeadMessage, legacyViewingMessage } from './enquiryNotices.js'
import { RETENTION_DAYS } from '../config/retentionSchedule.js'
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
import { Payout } from '../models/Payout.js'
import { PayoutAccount } from '../models/PayoutAccount.js'
import { PaymentAccount } from '../models/PaymentAccount.js'
import { WebhookSubscription } from '../models/WebhookSubscription.js'
import { BusinessReview } from '../models/BusinessReview.js'
import { BusinessInquiry } from '../models/BusinessInquiry.js'
import { Lead } from '../models/Lead.js'
import { Viewing } from '../models/Viewing.js'
import { Application } from '../models/Application.js'
import { Delegation } from '../models/Delegation.js'
import { AffiliateProfile, AffiliateAttribution, AffiliateCommission } from '../models/Affiliate.js'
import { FeatureFlag } from '../models/FeatureFlag.js'
import { ContentReport } from '../models/ContentReport.js'
import { DocumentModel } from '../models/Document.js'
import { Employment } from '../models/Employment.js'
import { PropertyExpense } from '../models/PropertyExpense.js'
import { BlogPost } from '../models/BlogPost.js'
import { Property } from '../models/Property.js'
import { Agreement } from '../models/Agreement.js'
import { Payment } from '../models/Payment.js'
import { MarketplaceTransaction } from '../models/MarketplaceTransaction.js'
import { Dispute } from '../models/Dispute.js'
import { MoveOut } from '../models/MoveOut.js'
import { MaintenanceRequest } from '../models/MaintenanceRequest.js'
import { Sponsorship } from '../models/Sponsorship.js'
import { Worker } from '../models/Worker.js'
import { ServiceBooking } from '../models/ServiceBooking.js'
import { Business } from '../models/Business.js'
import { BusinessListing } from '../models/BusinessListing.js'
import { Storefront } from '../models/Storefront.js'
import { Promotion, CouponRedemption } from '../models/Promotion.js'
import { AgencyProfile } from '../models/AgencyProfile.js'

export const ACCOUNT_ERASURE_DELAY_MS = RETENTION_DAYS.accountErasureGrace * 24 * 60 * 60 * 1000

/** Placeholder for schema-required contact fields on records other people keep. */
export const ERASED_NAME = 'Deleted User'
export const ERASED_CONTACT = 'removed'

/** A payout still moving needs its destination; erasure waits for it to settle. */
const IN_FLIGHT_PAYOUT_STATUSES: Array<'requested' | 'processing'> = ['requested', 'processing']
/** An affiliate commission not yet settled either way. */
const UNPAID_COMMISSION_STATUSES: Array<'pending' | 'approved' | 'payable'> = ['pending', 'approved', 'payable']

const referencedBy = async (checks: Array<() => PromiseLike<unknown>>) => {
  for (const check of checks) if (await check()) return true
  return false
}

/**
 * Listings: deleted with their photos, unless a tenancy, payment, dispute or
 * paid placement refers to one — then the record stays for the other party,
 * without photos or the search embedding.
 */
async function eraseProperties(uid: string): Promise<void> {
  const properties = await Property.find({ landlordId: uid }).select('_id images imageAssets')
  for (const property of properties) {
    const id = String(property._id)
    await eraseStoredAssets(propertyImageAssets(property))
    const referenced = await referencedBy([
      () => Agreement.exists({ propertyId: id }),
      () => Payment.exists({ propertyId: id }),
      () => MarketplaceTransaction.exists({ propertyId: id }),
      () => Dispute.exists({ propertyId: id }),
      () => MoveOut.exists({ propertyId: id }),
      () => MaintenanceRequest.exists({ propertyId: id }),
      () => Sponsorship.exists({ propertyId: id }),
    ])
    if (referenced) {
      await Property.updateOne({ _id: id }, { $set: { images: [], imageAssets: [], videos: [], listingStatus: 'withdrawn' }, $unset: { embedding: 1 } })
    } else {
      await Property.deleteOne({ _id: id })
      await Favorite.deleteMany({ propertyId: id })
    }
  }
}

/**
 * Public profiles: deleted, or — where a booking, payment or coupon use
 * still points at one — kept with every contact detail removed.
 */
async function eraseDirectoryProfiles(uid: string): Promise<void> {
  for (const worker of await Worker.find({ userId: uid }).select('_id').lean()) {
    const id = String(worker._id)
    if (await ServiceBooking.exists({ workerId: id })) {
      await Worker.updateOne({ _id: id }, {
        $set: { name: 'Closed profile', phone: ERASED_CONTACT, bio: '', portfolio: [], skills: [], status: 'offline', approvalStatus: 'rejected' },
        $unset: { email: 1, photo: 1, userId: 1 },
      })
    } else {
      await Worker.deleteOne({ _id: id })
    }
  }

  const businessIds = (await Business.find({ ownerId: uid }).select('_id').lean()).map((b) => String(b._id))
  if (businessIds.length) {
    // Enquiries and reviews exist only in relation to the business.
    await BusinessListing.deleteMany({ businessId: { $in: businessIds } })
    await BusinessInquiry.deleteMany({ businessId: { $in: businessIds } })
    await BusinessReview.deleteMany({ businessId: { $in: businessIds } })
    await Business.deleteMany({ _id: { $in: businessIds } })
  }

  const storefrontIds = (await Storefront.find({ ownerId: uid }).select('_id').lean()).map((s) => String(s._id))
  await releaseStorefrontDomains(storefrontIds)
  for (const id of storefrontIds) {
    await BlogPost.deleteMany({ storefrontId: id })
    if (await MarketplaceTransaction.exists({ storefrontId: id })) {
      await Storefront.updateOne({ _id: id }, {
        $set: { name: 'Closed storefront', slug: `closed-${id}`, status: 'archived' },
        $unset: { tagline: 1, about: 1, contact: 1, canonicalDomain: 1, 'branding.logoUrl': 1, 'branding.coverUrl': 1 },
      })
    } else {
      await Storefront.deleteOne({ _id: id })
    }
  }

  for (const promotion of await Promotion.find({ $or: [{ ownerId: uid }, { storefrontId: { $in: storefrontIds } }] }).select('_id').lean()) {
    const id = String(promotion._id)
    if (!(await CouponRedemption.exists({ promotionId: id }))) await Promotion.deleteOne({ _id: id })
  }

  await AgencyProfile.deleteMany({ ownerId: uid })
}

/** Idempotent cleanup. Retain the account tombstone until every operation succeeds. */
export async function eraseAccountRecords(uid: string, cutoff: Date): Promise<boolean> {
  // Recheck eligibility before touching related data, including on manual/retry calls.
  if (!(await User.exists({ _id: uid, deletedAt: { $lt: cutoff } }))) return false
  // The payout record keeps its own destination snapshot, but a transfer the
  // provider has not settled may still need the account behind it.
  if (await Payout.exists({ userId: uid, status: { $in: IN_FLIGHT_PAYOUT_STATUSES } })) {
    throw new Error('A payout is still in flight; account retained for retry')
  }
  await eraseAvatars(uid)
  await erasePersonalDocuments(uid)
  await eraseProperties(uid)
  await eraseDirectoryProfiles(uid)
  // Before the leads and viewings below lose the details it matches on.
  await scrubEnquiryNotifications(uid)
  // A per-run id, so two erased reporters' open reports on one target never
  // collide on the one-open-report index, and nothing links back to the account.
  const erasedReporter = `deleted-${randomUUID()}`
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
    // OWNER DECISION PENDING: sent messages are deleted, including from the
    // other person's thread; the alternative is redacting and keeping them
    // where a tenancy or dispute relies on them.
    () => Message.deleteMany({ senderId: uid }),
    () => Review.updateMany({ userId: uid }, { $set: { userName: ERASED_NAME } }),
    () => BusinessReview.updateMany({ authorId: uid }, { $set: { authorName: ERASED_NAME } }),
    // The preview duplicates message text, so removing Message alone leaks it.
    () => Conversation.updateMany({ 'lastMessage.senderId': uid }, { $unset: { lastMessage: 1 } }),
    () => Conversation.updateMany({ participants: uid }, {
      $pull: { participants: uid }, $unset: { [`unreadCount.${uid}`]: 1 },
    }),
    // Payout destinations hold full MoMo / bank account numbers.
    () => PayoutAccount.deleteMany({ userId: uid }),
    () => PaymentAccount.deleteMany({ ownerId: uid }),
    () => WebhookSubscription.deleteMany({ userId: uid }),
    // The enquirer's side: business enquiries go; leads and viewings stay in
    // the agent's pipeline without the enquirer's contact details.
    () => BusinessInquiry.deleteMany({ requesterId: uid }),
    () => Lead.updateMany({ requesterId: uid }, {
      $set: { contactName: ERASED_NAME, contactPhone: ERASED_CONTACT },
      $unset: { contactEmail: 1, message: 1, requesterId: 1 },
    }),
    // Notes are free text the enquirer wrote, like a lead's message.
    () => Viewing.updateMany({ requesterId: uid }, {
      $set: { viewerName: ERASED_NAME, viewerPhone: ERASED_CONTACT },
      $unset: { notes: 1, requesterId: 1 },
    }),
    // Approved applications are part of the tenancy record.
    () => Application.deleteMany({ tenantId: uid, status: { $ne: 'approved' } }),
    () => Delegation.deleteMany({ $or: [{ ownerId: uid }, { delegateId: uid }] }),
    () => AffiliateAttribution.updateMany({ referredUserId: uid }, { $unset: { referredUserId: 1, sessionId: 1 } }),
    () => eraseAffiliateProfile(uid),
    () => FeatureFlag.updateMany(
      { $or: [{ enabledForUserIds: uid }, { disabledForUserIds: uid }] },
      { $pull: { enabledForUserIds: uid, disabledForUserIds: uid } },
    ),
    () => ContentReport.updateMany({ reporterId: uid }, { $set: { reporterId: erasedReporter }, $unset: { ipAddress: 1 } }),
    () => DocumentModel.updateMany({ accessControl: uid }, { $pull: { accessControl: uid } }),
    () => Employment.deleteMany({ userId: uid, status: { $in: ['pending', 'declined'] } }),
    () => PropertyExpense.deleteMany({ landlordId: uid }),
    () => BlogPost.updateMany({ authorId: uid }, { $set: { author: 'RentOS' }, $unset: { authorId: 1 } }),
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
  // Their retention periods await the owner/legal decision (config/retentionSchedule.ts).
  const purged = await User.deleteOne({ _id: uid, deletedAt: { $lt: cutoff } })
  if (purged.deletedCount === 0) return false
  // Best-effort: an unmarked entry is completed by the next ledger replay.
  await markAccountErasureComplete(uid).catch(() => logger.warn(`[Account erasure] Ledger completion pending for account ${uid}`))
  return true
}

/**
 * Agents' notifications about this person's enquiries used to quote their name
 * and phone number (services/enquiryNotices.ts), and stay in the agent's inbox
 * for up to two years. Each one still stored is rewritten to today's wording,
 * matched exactly on the lead or viewing it announced. Timestamps are left
 * alone so the rewrite does not restart the notification's retention period.
 */
async function scrubEnquiryNotifications(uid: string): Promise<void> {
  const [leads, viewings] = await Promise.all([
    Lead.find({ requesterId: uid }).select('agentId contactName contactPhone').lean(),
    Viewing.find({ requesterId: uid }).select('agentId viewerName date time').lean(),
  ])
  for (const lead of leads) {
    await Notification.updateMany(
      { userId: lead.agentId, title: NEW_LEAD_TITLE, message: legacyLeadMessage(lead.contactName, lead.contactPhone) },
      { $set: { message: newLeadMessage() } },
      { timestamps: false },
    )
  }
  for (const viewing of viewings) {
    await Notification.updateMany(
      { userId: viewing.agentId, title: VIEWING_REQUESTED_TITLE, message: legacyViewingMessage(viewing.viewerName, viewing.date, viewing.time) },
      { $set: { message: viewingRequestedMessage(viewing.date, viewing.time) } },
      { timestamps: false },
    )
  }
}

/** The affiliate profile goes once nothing is owed on it; until then it is suspended. */
async function eraseAffiliateProfile(uid: string): Promise<void> {
  const profile = await AffiliateProfile.findOne({ userId: uid }).select('_id').lean()
  if (!profile) return
  const unpaid = await AffiliateCommission.exists({ affiliateId: String(profile._id), status: { $in: UNPAID_COMMISSION_STATUSES } })
  if (unpaid) {
    await AffiliateProfile.updateOne({ _id: profile._id }, { $set: { status: 'suspended', suspendedReason: 'Account closed' } })
    return
  }
  await AffiliateProfile.deleteOne({ _id: profile._id })
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

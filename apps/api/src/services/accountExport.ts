import type { Model, Types } from 'mongoose'
import { User } from '../models/User.js'
import { TenantProfile } from '../models/TenantProfile.js'
import { Agreement } from '../models/Agreement.js'
import { Payment } from '../models/Payment.js'
import { Application } from '../models/Application.js'
import { Dispute } from '../models/Dispute.js'
import { Review } from '../models/Review.js'
import { Conversation, Message } from '../models/Conversation.js'
import { Wallet } from '../models/Wallet.js'
import { WalletCredit } from '../models/WalletCredit.js'
import { SavingsPlan } from '../models/SavingsPlan.js'
import { AuditLog } from '../models/AuditLog.js'
import { UserBlock } from '../models/UserBlock.js'
import { StorePurchase } from '../models/StorePurchase.js'
import { ApplePurchase } from '../models/ApplePurchase.js'
import { FinancingApplication } from '../models/FinancingApplication.js'
import { FinancingContract } from '../models/FinancingContract.js'
import { FinancingOffer } from '../models/FinancingOffer.js'
import { Loan } from '../models/Loan.js'
import { CreditScore } from '../models/CreditScore.js'
import { Investment } from '../models/Investment.js'
import { InsurancePolicy } from '../models/InsurancePolicy.js'
import { Favorite } from '../models/Favorite.js'
import { Notification } from '../models/Notification.js'
import { Achievement } from '../models/Achievement.js'
import { PaymentStreak } from '../models/PaymentStreak.js'
import { DocumentModel } from '../models/Document.js'
import { ProfileAccess } from '../models/ProfileAccess.js'
import { MaintenanceRequest } from '../models/MaintenanceRequest.js'
import { MoveOut } from '../models/MoveOut.js'
import { RenewalOffer } from '../models/RenewalOffer.js'
import { Payout } from '../models/Payout.js'
import { PayoutAccount } from '../models/PayoutAccount.js'
import { PaymentAccount } from '../models/PaymentAccount.js'
import { MarketplaceTransaction } from '../models/MarketplaceTransaction.js'
import { ServiceBooking } from '../models/ServiceBooking.js'
import { Worker } from '../models/Worker.js'
import { Business } from '../models/Business.js'
import { BusinessListing } from '../models/BusinessListing.js'
import { BusinessReview } from '../models/BusinessReview.js'
import { BusinessInquiry } from '../models/BusinessInquiry.js'
import { Storefront } from '../models/Storefront.js'
import { StorefrontDomain } from '../models/StorefrontDomain.js'
import { Promotion, CouponRedemption } from '../models/Promotion.js'
import { Sponsorship } from '../models/Sponsorship.js'
import { Property } from '../models/Property.js'
import { PropertyExpense } from '../models/PropertyExpense.js'
import { Lead } from '../models/Lead.js'
import { Viewing } from '../models/Viewing.js'
import { Commission } from '../models/Commission.js'
import { AgencyProfile } from '../models/AgencyProfile.js'
import { Employer } from '../models/Employer.js'
import { Employment } from '../models/Employment.js'
import { DeductionMandate } from '../models/DeductionMandate.js'
import { PayrollRun } from '../models/PayrollRun.js'
import { FinancierProfile } from '../models/FinancierProfile.js'
import { InsuranceProviderProfile } from '../models/InsuranceProviderProfile.js'
import { AffiliateProfile, AffiliateAttribution, AffiliateCommission } from '../models/Affiliate.js'
import { ContentReport } from '../models/ContentReport.js'
import { Delegation } from '../models/Delegation.js'
import { CapabilityRecord } from '../models/CapabilityRecord.js'
import { WebhookSubscription } from '../models/WebhookSubscription.js'
import { RefreshToken } from '../models/RefreshToken.js'
import { BiometricToken } from '../models/BiometricToken.js'
import { DeviceToken } from '../models/DeviceToken.js'
import { ValuationLog } from '../models/ValuationLog.js'
import { BlogPost } from '../models/BlogPost.js'
import { AvatarAsset } from '../models/AvatarAsset.js'
import { Invitation } from '../models/Invitation.js'
import { FeatureFlag } from '../models/FeatureFlag.js'
import { PropertyReview } from '../models/PropertyReview.js'
import { decryptPii, PII_FIELDS } from '../utils/piiCrypto.js'
import { ownProfileView } from './tenantProfileViews.js'
import { evidenceForViewer } from './agreementEvidence.js'

/**
 * The subject-access export (Act 843 right of access; GET /users/me/export).
 *
 * EXPORT_SOURCES lists every collection that holds the account's personal
 * data, each read from the subject's OWN side only — e.g. leads the user
 * sent, not the leads an agent received, whose contact details belong to
 * other people. Secrets never leave: password and MFA material, token
 * hashes, webhook signing secrets, checkout access codes, share tokens and
 * search embeddings are deselected.
 *
 * EXPORT_EXCLUSIONS records, with a reason, every collection deliberately left
 * out. __tests__/retention-coverage.test.ts fails when a model is in neither,
 * so a new collection cannot silently drop out of the export.
 */
type Row = Record<string, unknown>
type Filter = Record<string, unknown>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = Model<any>

export interface ExportSource {
  /** Key in the export document. */
  key: string
  model: AnyModel
  filter: (uid: string, context: ExportContext) => Filter | null
  select?: string
  sort?: Record<string, 1 | -1>
  /** A single document (or null) instead of a list. */
  one?: boolean
  transform?: (value: Row | Row[] | null, uid: string, context: ExportContext) => unknown
}

/** Ids other sources depend on, looked up once per export. */
interface ExportContext {
  email?: string
  businessIds: string[]
  storefrontIds: string[]
  affiliateProfileId?: string
  /** Conversation id -> the other participants. */
  conversationCounterparts: Map<string, string[]>
}

const own = (field: string) => (uid: string): Filter => ({ [field]: uid })
const either = (...fields: string[]) => (uid: string): Filter => ({ $or: fields.map((field) => ({ [field]: uid })) })
const idOf = (row: { _id?: unknown }) => String(row._id as Types.ObjectId)

export const EXPORT_SOURCES: readonly ExportSource[] = [
  {
    key: 'user', model: User, filter: (uid) => ({ _id: uid }), one: true,
    // Never export credential material — mfaSecret also carries schema-level
    // select:false, this is defense-in-depth.
    select: '+storeAccountToken -passwordHash -mfaSecret -__v',
    // The subject's own export carries their national ID in the clear.
    transform: (user) => user && { ...user, ghanaCardId: decryptPii((user as Row).ghanaCardId as string | undefined, PII_FIELDS.userGhanaCard), id: idOf(user as Row) },
  },
  { key: 'tenantProfile', model: TenantProfile, filter: own('userId'), one: true, transform: (p) => p && ownProfileView(p as Row & { _id: unknown }) },
  {
    key: 'agreements', model: Agreement, filter: either('tenantId', 'landlordId'),
    // The counterparty's signing IP/device is their personal data, not ours to export.
    transform: (rows, uid) => (rows as Row[]).map((a) => ({ ...a, signatureEvidence: evidenceForViewer(a.signatureEvidence as never[], uid, false) })),
  },
  { key: 'payments', model: Payment, filter: either('tenantId', 'landlordId') },
  { key: 'applications', model: Application, filter: own('tenantId') },
  { key: 'disputes', model: Dispute, filter: either('filedBy', 'filedAgainst') },
  { key: 'reviews', model: Review, filter: own('userId') },
  {
    key: 'messages', model: Message, filter: own('senderId'),
    // Each sent message says which conversation it belongs to and who it went to.
    transform: (rows, _uid, ctx) => (rows as Row[]).map((m) => ({ ...m, counterpartIds: ctx.conversationCounterparts.get(String(m.conversationId)) ?? [] })),
  },
  {
    key: 'conversations', model: Conversation, filter: own('participants'),
    // The preview duplicates whoever sent the last message; it is left out.
    select: 'participants propertyId createdAt updatedAt',
    transform: (rows, uid) => (rows as Row[]).map((c) => ({ id: idOf(c), counterpartIds: (c.participants as string[]).filter((p) => p !== uid), propertyId: c.propertyId, createdAt: c.createdAt, updatedAt: c.updatedAt })),
  },
  { key: 'wallet', model: Wallet, filter: own('userId'), one: true },
  { key: 'savingsPlans', model: SavingsPlan, filter: own('userId') },
  { key: 'auditLogs', model: AuditLog, filter: own('userId'), sort: { createdAt: -1, _id: -1 } },
  { key: 'blockedUsers', model: UserBlock, filter: own('blockerId'), select: 'blockedId createdAt' },
  { key: 'storePurchases', model: StorePurchase, filter: own('userId'), select: 'platform applicationId providerState environment acknowledged voidedOrderIds startedAt verifiedAt entitlementState createdAt updatedAt items.productId items.basePlanId items.offerId items.expiresAt items.autoRenewing items.latestOrderId items.accessEligible' },
  // Explicit public fields prevent recovery metadata and encrypted identifiers
  // from becoming export data when the purchase journal gains new fields.
  { key: 'applePurchases', model: ApplePurchase, filter: own('userId'), select: 'applicationId environment productId subscriptionGroupId providerStatus purchasedAt originalPurchasedAt expiresAt verifiedAt revokedAt upgraded autoRenewing graceExpiresAt accessExpiresAt accessEligible entitlementState createdAt updatedAt' },
  { key: 'walletCredits', model: WalletCredit, filter: own('userId'), select: 'operationKey amount type reference state appliedAt createdAt updatedAt' },
  // Personal export follows borrower identity, not privileged portfolio access.
  { key: 'financingApplications', model: FinancingApplication, filter: own('applicantId') },
  { key: 'financingContracts', model: FinancingContract, filter: own('applicantId') },
  { key: 'financingOffers', model: FinancingOffer, filter: own('financierId') },
  { key: 'loans', model: Loan, filter: own('userId') },
  { key: 'creditScore', model: CreditScore, filter: own('userId'), one: true },
  { key: 'investments', model: Investment, filter: own('userId') },
  { key: 'insurancePolicies', model: InsurancePolicy, filter: own('userId') },
  { key: 'favorites', model: Favorite, filter: own('userId') },
  { key: 'notifications', model: Notification, filter: own('userId') },
  { key: 'achievements', model: Achievement, filter: own('userId') },
  { key: 'paymentStreak', model: PaymentStreak, filter: own('userId'), one: true },

  // ─── Files, access and sharing ───
  { key: 'documents', model: DocumentModel, filter: own('ownerId') },
  { key: 'avatars', model: AvatarAsset, filter: own('ownerId'), select: 'publicId legacyUrl createdAt' },
  // Who asked to see this tenant's profile, and whose profiles this account asked to see.
  { key: 'profileAccess', model: ProfileAccess, filter: either('tenantId', 'requesterId') },
  { key: 'delegations', model: Delegation, filter: either('ownerId', 'delegateId') },
  { key: 'invitationsReceived', model: Invitation, filter: (_uid, ctx) => (ctx.email ? { email: ctx.email } : null), select: 'roles status expiresAt acceptedAt createdAt' },
  { key: 'webhookSubscriptions', model: WebhookSubscription, filter: own('userId'), select: '-secret' },
  { key: 'sessions', model: RefreshToken, filter: own('userId'), select: 'deviceLabel ipAddress lastUsedAt expiresAt revokedAt revokedReason createdAt' },
  { key: 'biometricDevices', model: BiometricToken, filter: own('userId'), select: 'deviceId deviceLabel lastUsedAt expiresAt revokedAt revokedReason createdAt' },
  { key: 'pushDevices', model: DeviceToken, filter: own('userId'), select: 'platform lastSeenAt createdAt' },
  { key: 'featureFlags', model: FeatureFlag, filter: either('enabledForUserIds', 'disabledForUserIds'), select: 'key description' },

  // ─── Tenancy ───
  { key: 'maintenanceRequests', model: MaintenanceRequest, filter: either('tenantId', 'landlordId') },
  { key: 'moveOuts', model: MoveOut, filter: either('tenantId', 'landlordId') },
  { key: 'renewalOffers', model: RenewalOffer, filter: either('tenantId', 'landlordId') },

  // ─── Money ───
  { key: 'payouts', model: Payout, filter: own('userId') },
  { key: 'payoutAccount', model: PayoutAccount, filter: own('userId'), one: true },
  { key: 'paymentAccount', model: PaymentAccount, filter: own('ownerId'), one: true },
  { key: 'marketplaceTransactions', model: MarketplaceTransaction, filter: either('buyerId', 'sellerId'), select: '-providerAccessCode -processedEventIds' },
  { key: 'serviceBookings', model: ServiceBooking, filter: either('requesterId', 'workerUserId') },
  { key: 'couponRedemptions', model: CouponRedemption, filter: own('userId') },
  { key: 'sponsorships', model: Sponsorship, filter: own('ownerId') },
  { key: 'commissions', model: Commission, filter: own('agentId') },
  { key: 'capabilityRecords', model: CapabilityRecord, filter: either('ownerId', 'participantId') },

  // ─── Listings and public profiles ───
  { key: 'properties', model: Property, filter: own('landlordId'), select: '-embedding' },
  { key: 'propertyExpenses', model: PropertyExpense, filter: own('landlordId') },
  { key: 'worker', model: Worker, filter: own('userId'), one: true },
  { key: 'businesses', model: Business, filter: own('ownerId') },
  { key: 'businessListings', model: BusinessListing, filter: (_uid, ctx) => ({ businessId: { $in: ctx.businessIds } }) },
  { key: 'storefronts', model: Storefront, filter: own('ownerId') },
  { key: 'storefrontDomains', model: StorefrontDomain, filter: (_uid, ctx) => ({ storefrontId: { $in: ctx.storefrontIds } }) },
  { key: 'promotions', model: Promotion, filter: own('ownerId') },
  { key: 'agencyProfile', model: AgencyProfile, filter: own('ownerId'), one: true },
  { key: 'blogPosts', model: BlogPost, filter: own('authorId') },

  // ─── What this account sent to others (its own side only) ───
  { key: 'businessReviews', model: BusinessReview, filter: own('authorId') },
  { key: 'businessInquiries', model: BusinessInquiry, filter: own('requesterId') },
  { key: 'leads', model: Lead, filter: own('requesterId') },
  { key: 'viewings', model: Viewing, filter: own('requesterId') },
  // The report and its outcome; the reported person's id and the moderator are not the reporter's data.
  { key: 'contentReports', model: ContentReport, filter: own('reporterId'), select: 'targetType targetId targetLabel reason details status action resolutionNote handledAt ipAddress createdAt updatedAt' },
  { key: 'valuationRequests', model: ValuationLog, filter: own('requestedBy') },
  { key: 'listingReviewDecisions', model: PropertyReview, filter: own('reviewerId') },

  // ─── Roles ───
  { key: 'employers', model: Employer, filter: own('ownerId') },
  { key: 'employments', model: Employment, filter: own('userId') },
  { key: 'deductionMandates', model: DeductionMandate, filter: own('employeeId') },
  { key: 'payrollRuns', model: PayrollRun, filter: own('employeeId') },
  { key: 'financierProfile', model: FinancierProfile, filter: own('userId'), one: true },
  { key: 'insuranceProviderProfile', model: InsuranceProviderProfile, filter: own('userId'), one: true },
  { key: 'affiliateProfile', model: AffiliateProfile, filter: own('userId'), one: true },
  { key: 'affiliateCommissions', model: AffiliateCommission, filter: (_uid, ctx) => (ctx.affiliateProfileId ? { affiliateId: ctx.affiliateProfileId } : null) },
  // How this account was referred — not the referrer's own records.
  { key: 'referral', model: AffiliateAttribution, filter: own('referredUserId'), select: 'code source campaign createdAt' },
]

/** Collections deliberately not in the export, and why. */
export const EXPORT_EXCLUSIONS: Readonly<Record<string, string>> = {
  AppleTransactionRevocation: 'Keyed by a hash of the App Store transaction with no account id; the purchase itself is exported under applePurchases.',
  RevokedSession: 'A random session id and an expiry, with no account id; deleted about 16 minutes after sign-out. Sign-in sessions are exported under sessions.',
  RegistryPageView: 'Hashed IP address with no account id; it cannot be attributed to an account.',
  StorefrontEvent: 'A visitor hash with no account id; it cannot be attributed to an account.',
  ComplaintLog: 'Redacted complaint text with no account id.',
  WebhookEvent: 'Raw provider notifications with no account id, kept 90 days; the payments they settled are exported.',
  StoreNotification: 'App-store delivery de-duplication ids; no personal data.',
  ErasureLedger: 'Ids of records already erased; nothing about a live account.',
  JobRun: 'Scheduler bookkeeping; no personal data.',
  CronLock: 'Scheduler locks; no personal data.',
  BootstrapState: 'Deployment bookkeeping; no personal data.',
  LegalArticle: 'Published legal reference content.',
  LegalDocument: 'Published legal templates.',
  PlanEntitlement: 'Subscription plan configuration.',
  SubscriptionPackage: 'Subscription plan catalogue.',
  StoreProduct: 'App-store product catalogue.',
  SponsorshipProduct: 'Paid placement catalogue.',
  InsuranceProduct: 'Insurance product catalogue.',
  InvestmentProduct: 'Investment product catalogue.',
  InvestmentPartner: 'Partner institution records, not individuals.',
  ReviewerOrganization: 'Moderation organisation configuration.',
}

async function buildContext(uid: string): Promise<ExportContext> {
  const [user, businesses, storefronts, affiliate, conversations] = await Promise.all([
    User.findById(uid).select('email').lean(),
    Business.find({ ownerId: uid }).select('_id').lean(),
    Storefront.find({ ownerId: uid }).select('_id').lean(),
    AffiliateProfile.findOne({ userId: uid }).select('_id').lean(),
    Conversation.find({ participants: uid }).select('participants').lean(),
  ])
  return {
    email: user?.email,
    businessIds: businesses.map((b) => idOf(b)),
    storefrontIds: storefronts.map((s) => idOf(s)),
    affiliateProfileId: affiliate ? idOf(affiliate) : undefined,
    conversationCounterparts: new Map(conversations.map((c) => [idOf(c), (c.participants as string[]).filter((p) => p !== uid)])),
  }
}

async function readSource(source: ExportSource, uid: string, context: ExportContext): Promise<unknown> {
  const filter = source.filter(uid, context)
  if (!filter) return source.one ? null : []
  const select = source.select ?? '-__v'
  const value = source.one
    ? await source.model.findOne(filter).select(select).lean<Row>()
    : await source.model.find(filter).select(select).sort(source.sort ?? { _id: 1 }).lean<Row[]>()
  return source.transform ? source.transform(value ?? null, uid, context) : value ?? null
}

/** Everything the account holds, keyed by source. */
export async function buildAccountExport(uid: string): Promise<Record<string, unknown>> {
  const context = await buildContext(uid)
  const values = await Promise.all(EXPORT_SOURCES.map((source) => readSource(source, uid, context)))
  return {
    exportedAt: new Date().toISOString(),
    ...Object.fromEntries(EXPORT_SOURCES.map((source, i) => [source.key, values[i]])),
  }
}

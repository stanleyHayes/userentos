/**
 * The retention schedule: every collection the API stores, what personal data
 * it holds, how long it is kept, what enforces that, and what happens to it
 * when an account is closed (Act 843: no longer than the purpose requires).
 *
 * One place, so the privacy notice, the purge job and the TTL indexes agree.
 * Periods the notice quotes come from RETENTION_PERIOD_DAYS in the shared
 * types (packages/shared/types/index.ts), which the web and mobile notices
 * render; change a period there, not in a model.
 *
 * __tests__/retention-coverage.test.ts fails when a model is registered that
 * no rule classifies, when a TTL index disagrees with its rule, or when a
 * 'purge' rule has no purge handler — so a new collection cannot quietly be
 * kept forever.
 *
 * Changing a TTL period on an existing collection needs the index rebuilt
 * (collMod or drop + recreate) — Mongoose does not alter an existing index.
 * src/scripts/verifyRetentionIndexes.ts reports any drift in a live database.
 */
import { RETENTION_PERIOD_DAYS } from '../types/index.js'

const DAY_SECONDS = 24 * 60 * 60

export const RETENTION_DAYS = {
  /** Public registry page views (hashed IP, user agent, referrer): 13 months, a year-on-year view. */
  registryPageView: RETENTION_PERIOD_DAYS.registryPageView,
  /** In-app notifications the user has read. */
  readNotification: RETENTION_PERIOD_DAYS.readNotification,
  /** Notifications never read: two years after they were last touched. */
  unreadNotification: RETENTION_PERIOD_DAYS.unreadNotification,
  /** Abuse reports dismissed with no action (reporter id, text, IP), after handling. */
  dismissedContentReport: RETENTION_PERIOD_DAYS.dismissedContentReport,
  /** Raw payment/payout provider webhook payloads: dispute investigation window. */
  webhookEvent: RETENTION_PERIOD_DAYS.webhookEvent,
  /** App-store notification delivery dedupe records, after processing. */
  storeNotification: RETENTION_PERIOD_DAYS.storeNotification,
  /** Redacted dispute complaints queued for model review. */
  complaintLog: RETENTION_PERIOD_DAYS.complaintLog,
  /** Storefront analytics events. */
  storefrontEvent: RETENTION_PERIOD_DAYS.storefrontEvent,
  /** Rent valuation requests and outcomes (pricing-model evidence). */
  valuationLog: RETENTION_PERIOD_DAYS.valuationLog,
  /** Security/audit trail (includes IP addresses): purged daily. */
  auditLog: RETENTION_PERIOD_DAYS.auditLog,
  /** A closed account's tombstone and related records, after closure. */
  accountErasureGrace: RETENTION_PERIOD_DAYS.accountErasureGrace,
  /** Applications that were never approved, after their last update. */
  unapprovedApplication: RETENTION_PERIOD_DAYS.unapprovedApplication,
  /** Leads, viewing requests and business enquiries, after their last update. */
  enquiry: RETENTION_PERIOD_DAYS.enquiry,
  /** Denied or revoked profile-access requests, after the answer. */
  closedProfileAccess: RETENTION_PERIOD_DAYS.closedProfileAccess,
  /** Profile photos that are no longer the account's current photo. */
  replacedAvatar: RETENTION_PERIOD_DAYS.replacedAvatar,
} as const

export type RetentionKey = keyof typeof RETENTION_DAYS

/** TTL index `expireAfterSeconds` for a retention period. */
export const ttlSeconds = (key: RetentionKey) => RETENTION_DAYS[key] * DAY_SECONDS

export const retentionCutoff = (key: RetentionKey, now = Date.now()) => new Date(now - RETENTION_DAYS[key] * DAY_SECONDS * 1000)

/**
 * How long database backups are kept. Deleted data survives in a backup until
 * the backup expires, so the erasure ledger (which re-applies deletions after
 * a restore) must outlive every backup. The default covers Atlas's default
 * snapshot policy (monthly snapshots kept 12 months); set the real figure once
 * the production backup policy is confirmed.
 */
export function backupRetentionDays(): number {
  const raw = Number(process.env.BACKUP_RETENTION_DAYS)
  return Number.isSafeInteger(raw) && raw > 0 ? raw : 365
}

/** Safety margin on top of the backup window before a ledger entry may expire. */
export const ERASURE_LEDGER_MARGIN_DAYS = 30

/** Days a completed erasure ledger entry is kept: backup window + margin. */
export const erasureLedgerDays = () => backupRetentionDays() + ERASURE_LEDGER_MARGIN_DAYS

export type RetentionTrigger =
  | 'createdAt' | 'updatedAt' | 'handledAt' | 'processedAt' | 'expiresAt' | 'respondedAt'
  | 'accountClosed' | 'tenancyEnded' | 'transactionDate' | 'replaced' | 'accountLifetime' | 'none'

/**
 * - ttl: a MongoDB TTL index on `ttlField` (runs in the database).
 * - purge: services/retentionPurge.ts, daily, in bounded batches.
 * - accountErasure: services/accountErasure.ts, `periodDays` after closure.
 * - accountClosure: services/accountClosure.ts, at the moment of closure.
 * - none: kept; no automated disposal yet (see `decision`).
 */
export type RetentionEnforcement = 'ttl' | 'purge' | 'accountErasure' | 'accountClosure' | 'none'

export type RetentionAction = 'delete' | 'anonymise' | 'retain'

/**
 * - engineering_default: a period engineering set and the notice publishes;
 *   the owner may still change it.
 * - owner_legal_pending: the legal retention period is not yet confirmed. The
 *   records are kept (never purged) and used for nothing else meanwhile.
 * - owner_confirmed: signed off by the owner / legal review.
 * - not_personal: configuration or catalogue data about no one.
 */
export type RetentionDecision = 'engineering_default' | 'owner_legal_pending' | 'owner_confirmed' | 'not_personal'

export interface RetentionRule {
  id: string
  /** Mongoose model names the rule governs (a model may need several rules for different subsets). */
  models: readonly string[]
  /** Which records of those models, when the rule covers only some. */
  appliesTo?: string
  personalData: boolean
  /** What personal data is held. */
  data: string
  trigger: RetentionTrigger
  /** null: no end date (kept while the purpose lasts, or pending a legal decision). */
  periodDays: number | null
  action: RetentionAction
  enforcedBy: RetentionEnforcement
  /** For enforcedBy 'ttl': the indexed date field. */
  ttlField?: string
  /** What closing the account does to these records. */
  onAccountClosure: string
  basis: string
  decision: RetentionDecision
}

const GRACE = RETENTION_DAYS.accountErasureGrace
const TENANCY_PENDING = 'OWNER/LEGAL: contract limitation period (Limitation Act 1972, NRCD 54), Rent Act 1963 (Act 220) receipt duties and Electronic Transactions Act 2008 (Act 772) — period to be confirmed. Kept and not used for any other purpose meanwhile.'
const FINANCIAL_PENDING = 'OWNER/LEGAL: tax and company record-keeping (Revenue Administration Act 2016 (Act 915), Income Tax Act 2015 (Act 896), Companies Act 2019 (Act 992)) — period to be confirmed. Kept and not used for any other purpose meanwhile.'
const REGULATED_PENDING = 'OWNER/LEGAL: sector record-keeping (Anti-Money Laundering Act 2020 (Act 1044), BoG/SEC/NIC rules) before any regulated feature is switched on — period to be confirmed. Kept and not used for any other purpose meanwhile.'

export const RETENTION_SCHEDULE: readonly RetentionRule[] = [
  // ─── Account and identity ───
  {
    id: 'account.identity', models: ['User'], personalData: true,
    data: 'Name, email, phone, Ghana Card number (encrypted), password hash, MFA secret, settings, consent versions and signing IP/device.',
    trigger: 'accountClosed', periodDays: GRACE, action: 'delete', enforcedBy: 'accountErasure',
    onAccountClosure: 'Identity scrubbed at closure (name, contacts, ID number, photo, MFA, consent IP/device, settings); a minimal tombstone is deleted after the grace period.',
    basis: 'Contract (the account) while open; minimisation on closure.', decision: 'engineering_default',
  },
  {
    id: 'account.tenantProfile', models: ['TenantProfile'], personalData: true,
    data: 'Rental profile: employment, income, references, household, ID details, passport sharing.',
    trigger: 'accountClosed', periodDays: GRACE, action: 'delete', enforcedBy: 'accountErasure',
    onAccountClosure: 'Every share link and approved landlord access is revoked at closure; the profile is deleted after the grace period.',
    basis: 'Consent / contract while the account is open.', decision: 'engineering_default',
  },
  {
    id: 'account.avatar.current', models: ['AvatarAsset'], appliesTo: 'The current profile photo', personalData: true,
    data: 'Profile photo file (Cloudinary) and its storage id.',
    trigger: 'accountClosed', periodDays: GRACE, action: 'delete', enforcedBy: 'accountErasure',
    onAccountClosure: 'Removed from the profile at closure; the file is deleted (with CDN invalidation) after the grace period.',
    basis: 'Contract while the account is open.', decision: 'engineering_default',
  },
  {
    id: 'account.avatar.replaced', models: ['AvatarAsset'], appliesTo: 'Photos that are no longer the current profile photo', personalData: true,
    data: 'Replaced profile photo files.',
    trigger: 'replaced', periodDays: RETENTION_DAYS.replacedAvatar, action: 'delete', enforcedBy: 'purge',
    onAccountClosure: 'Deleted after the grace period.', basis: 'No purpose once replaced.', decision: 'engineering_default',
  },
  {
    id: 'account.identityDocuments', models: ['Document'], appliesTo: "Identity documents and standalone 'other' uploads", personalData: true,
    data: 'Uploaded identity files and miscellaneous personal files (Cloudinary).',
    trigger: 'accountClosed', periodDays: GRACE, action: 'delete', enforcedBy: 'accountErasure',
    onAccountClosure: 'Files and records deleted after the grace period.', basis: 'Consent / contract while the account is open.', decision: 'engineering_default',
  },
  {
    id: 'tenancy.documents', models: ['Document'], appliesTo: 'Rental agreements, receipts, legal notices, dispute evidence and files linked to a tenancy record', personalData: true,
    data: 'Contract, receipt, notice and evidence files (Cloudinary; evidence is not publicly accessible).',
    trigger: 'tenancyEnded', periodDays: null, action: 'retain', enforcedBy: 'none',
    onAccountClosure: 'Retained: the other party to the tenancy relies on them.', basis: TENANCY_PENDING, decision: 'owner_legal_pending',
  },
  {
    id: 'account.sessions', models: ['RefreshToken', 'BiometricToken'], personalData: true,
    data: 'Sign-in session and biometric enrolment records (token hashes, device, IP).',
    trigger: 'expiresAt', periodDays: 0, action: 'delete', enforcedBy: 'ttl', ttlField: 'expiresAt',
    onAccountClosure: 'Revoked at closure (every device signed out); deleted after the grace period if not expired first.',
    basis: 'Security of the account.', decision: 'engineering_default',
  },
  {
    id: 'account.invitations', models: ['Invitation'], personalData: true,
    data: 'Invited email address and role.', trigger: 'expiresAt', periodDays: 0, action: 'delete', enforcedBy: 'ttl', ttlField: 'expiresAt',
    onAccountClosure: 'Not linked to the invitee account; expires on its own.', basis: 'Only needed until accepted or expired.', decision: 'engineering_default',
  },
  {
    id: 'account.devices', models: ['DeviceToken'], personalData: true,
    data: 'Push notification device tokens.', trigger: 'accountLifetime', periodDays: null, action: 'delete', enforcedBy: 'accountClosure',
    onAccountClosure: 'Deleted at closure.', basis: 'Needed to deliver notifications while signed in.', decision: 'engineering_default',
  },
  {
    id: 'account.activity', models: ['UserBlock', 'Favorite', 'Achievement', 'PaymentStreak', 'CreditScore'], personalData: true,
    data: 'Blocked users, saved properties, badges, payment streaks and derived scores.',
    trigger: 'accountClosed', periodDays: GRACE, action: 'delete', enforcedBy: 'accountErasure',
    onAccountClosure: 'Deleted after the grace period.', basis: 'Features of the account; no purpose after closure.', decision: 'engineering_default',
  },
  {
    id: 'notifications.read', models: ['Notification'], appliesTo: 'Read notifications', personalData: true,
    data: 'In-app notification text.', trigger: 'createdAt', periodDays: RETENTION_DAYS.readNotification, action: 'delete', enforcedBy: 'ttl', ttlField: 'createdAt',
    onAccountClosure: 'Deleted after the grace period.', basis: 'Service history for the user.', decision: 'engineering_default',
  },
  {
    id: 'notifications.unread', models: ['Notification'], appliesTo: 'Every notification, from its last update', personalData: true,
    data: 'In-app notification text.', trigger: 'updatedAt', periodDays: RETENTION_DAYS.unreadNotification, action: 'delete', enforcedBy: 'ttl', ttlField: 'updatedAt',
    onAccountClosure: 'Deleted after the grace period.', basis: 'Service history for the user.', decision: 'engineering_default',
  },
  {
    id: 'profileAccess.open', models: ['ProfileAccess'], appliesTo: 'Pending and approved requests', personalData: true,
    data: 'Who asked to see a tenant profile, and the answer.', trigger: 'accountClosed', periodDays: GRACE, action: 'delete', enforcedBy: 'accountErasure',
    onAccountClosure: 'Approved access is revoked at closure; records deleted after the grace period.', basis: 'Consent of the tenant.', decision: 'engineering_default',
  },
  {
    id: 'profileAccess.closed', models: ['ProfileAccess'], appliesTo: 'Denied and revoked requests', personalData: true,
    data: 'Who asked to see a tenant profile, and the answer.', trigger: 'respondedAt', periodDays: RETENTION_DAYS.closedProfileAccess, action: 'delete', enforcedBy: 'purge',
    onAccountClosure: 'Deleted after the grace period.', basis: 'Short history so the tenant can see who asked.', decision: 'engineering_default',
  },
  {
    id: 'security.auditLog', models: ['AuditLog'], personalData: true,
    data: 'Security and audit trail: actions, account ids, IP addresses, and sign-up consent with IP address and device.',
    trigger: 'createdAt', periodDays: RETENTION_DAYS.auditLog, action: 'delete', enforcedBy: 'purge',
    onAccountClosure: 'Retained for the full period, including after account deletion.', basis: 'Security, fraud prevention and evidence of consent (legitimate interest / legal obligation).', decision: 'engineering_default',
  },
  {
    id: 'integrations.webhooks', models: ['WebhookSubscription'], personalData: true,
    data: 'Webhook endpoint URL and signing secret.', trigger: 'accountLifetime', periodDays: null, action: 'delete', enforcedBy: 'accountClosure',
    onAccountClosure: 'Deleted at closure, so no further events are delivered.', basis: 'Contract while the account is open.', decision: 'engineering_default',
  },
  {
    id: 'account.delegations', models: ['Delegation'], personalData: true,
    data: 'Who may act on whose property.', trigger: 'accountClosed', periodDays: GRACE, action: 'delete', enforcedBy: 'accountErasure',
    onAccountClosure: 'Deleted after the grace period, on either side.', basis: 'Contract while the account is open.', decision: 'engineering_default',
  },
  {
    id: 'system.featureFlags', models: ['FeatureFlag'], personalData: true,
    data: 'Feature targeting lists holding account ids.', trigger: 'accountClosed', periodDays: GRACE, action: 'anonymise', enforcedBy: 'accountErasure',
    onAccountClosure: 'The account id is removed from every targeting list after the grace period.', basis: 'Service operation.', decision: 'engineering_default',
  },
  {
    id: 'messages', models: ['Conversation', 'Message'], personalData: true,
    data: 'Chat messages and conversation membership.', trigger: 'accountClosed', periodDays: GRACE, action: 'delete', enforcedBy: 'accountErasure',
    onAccountClosure: "Messages the user sent are deleted (also from the other person's thread) and the user leaves every conversation after the grace period.",
    basis: 'Contract while the account is open. OWNER decision pending: whether messages tied to a tenancy or dispute should be redacted and kept instead.', decision: 'engineering_default',
  },

  // ─── Tenancy records ───
  {
    id: 'tenancy.records', models: ['Agreement', 'RenewalOffer', 'MoveOut', 'MaintenanceRequest', 'Dispute'], personalData: true,
    data: 'Tenancy agreements with signature evidence, renewals, move-outs, maintenance requests and disputes.',
    trigger: 'tenancyEnded', periodDays: null, action: 'retain', enforcedBy: 'none',
    onAccountClosure: 'Retained: the other party relies on them.', basis: TENANCY_PENDING, decision: 'owner_legal_pending',
  },
  {
    id: 'applications.approved', models: ['Application'], appliesTo: 'Approved applications (part of the tenancy record)', personalData: true,
    data: 'Rental application and the sections shared with the landlord.', trigger: 'tenancyEnded', periodDays: null, action: 'retain', enforcedBy: 'none',
    onAccountClosure: 'Retained with the tenancy record.', basis: TENANCY_PENDING, decision: 'owner_legal_pending',
  },
  {
    id: 'applications.unapproved', models: ['Application'], appliesTo: 'Pending, rejected and withdrawn applications', personalData: true,
    data: 'Rental application and message.', trigger: 'updatedAt', periodDays: RETENTION_DAYS.unapprovedApplication, action: 'delete', enforcedBy: 'purge',
    onAccountClosure: 'Deleted after the grace period.', basis: 'Only needed while the application is live, plus a year of history.', decision: 'engineering_default',
  },

  // ─── Financial records ───
  {
    id: 'financial.records',
    models: ['Payment', 'Payout', 'Wallet', 'WalletCredit', 'MarketplaceTransaction', 'Commission', 'Sponsorship', 'StorePurchase', 'ApplePurchase', 'AppleTransactionRevocation', 'CouponRedemption', 'AffiliateCommission', 'ServiceBooking', 'CapabilityRecord'],
    personalData: true,
    data: 'Rent payments and receipts, payouts, wallet ledgers, marketplace and booking payments, commissions, paid placements, app-store purchases and coupon use.',
    trigger: 'transactionDate', periodDays: null, action: 'retain', enforcedBy: 'none',
    onAccountClosure: 'Retained.', basis: FINANCIAL_PENDING, decision: 'owner_legal_pending',
  },
  {
    id: 'financial.providerEvents', models: ['WebhookEvent'], personalData: true,
    data: 'Raw payment and payout provider notifications.', trigger: 'createdAt', periodDays: RETENTION_DAYS.webhookEvent, action: 'delete', enforcedBy: 'ttl', ttlField: 'createdAt',
    onAccountClosure: 'Not linked to an account id; expires on its own.', basis: 'Payment investigation window.', decision: 'engineering_default',
  },
  {
    id: 'financial.storeNotifications', models: ['StoreNotification'], personalData: false,
    data: 'App-store notification ids (delivery de-duplication).', trigger: 'processedAt', periodDays: RETENTION_DAYS.storeNotification, action: 'delete', enforcedBy: 'ttl', ttlField: 'processedAt',
    onAccountClosure: 'Not linked to an account.', basis: 'De-duplication only.', decision: 'engineering_default',
  },
  {
    id: 'financial.payoutDestinations', models: ['PayoutAccount', 'PaymentAccount'], personalData: true,
    data: 'Mobile money or bank account for payouts, and the resolved account name.', trigger: 'accountClosed', periodDays: GRACE, action: 'delete', enforcedBy: 'accountErasure',
    onAccountClosure: 'Deleted after the grace period, once no payout is still in flight (the payout record keeps its own snapshot).',
    basis: 'Contract while the account is open.', decision: 'engineering_default',
  },

  // ─── Regulated services ───
  {
    id: 'regulated.records',
    models: ['Loan', 'FinancingApplication', 'FinancingContract', 'FinancingOffer', 'Investment', 'InsurancePolicy', 'DeductionMandate', 'PayrollRun', 'SavingsPlan', 'Employer', 'FinancierProfile', 'InsuranceProviderProfile'],
    personalData: true,
    data: 'Loans, financing, investments, insurance, savings, payroll deductions and partner institution profiles.',
    trigger: 'transactionDate', periodDays: null, action: 'retain', enforcedBy: 'none',
    onAccountClosure: 'Retained.', basis: REGULATED_PENDING, decision: 'owner_legal_pending',
  },
  {
    id: 'regulated.employment.accepted', models: ['Employment'], appliesTo: 'Employment links the employee accepted', personalData: true,
    data: 'Employer link, salary and job title.', trigger: 'none', periodDays: null, action: 'retain', enforcedBy: 'none',
    onAccountClosure: 'Retained with payroll records.', basis: REGULATED_PENDING, decision: 'owner_legal_pending',
  },
  {
    id: 'regulated.employment.unaccepted', models: ['Employment'], appliesTo: 'Invitations never accepted', personalData: true,
    data: 'Invited email, salary and job title.', trigger: 'accountClosed', periodDays: GRACE, action: 'delete', enforcedBy: 'accountErasure',
    onAccountClosure: 'Deleted after the grace period.', basis: 'No purpose without the employee acceptance.', decision: 'engineering_default',
  },

  // ─── Listings and public profiles ───
  {
    id: 'listings.properties', models: ['Property'], personalData: true,
    data: 'Listing details, address, photos (Cloudinary) and search embedding.',
    trigger: 'accountClosed', periodDays: GRACE, action: 'delete', enforcedBy: 'accountErasure',
    onAccountClosure: 'Taken down at closure. After the grace period deleted with its photos, or — where a tenancy, payment or dispute refers to it — kept without photos.',
    basis: 'Contract while listed; tenancy records for referenced listings.', decision: 'engineering_default',
  },
  {
    id: 'listings.propertyExpenses', models: ['PropertyExpense'], personalData: true,
    data: "A landlord's own expense entries.", trigger: 'accountClosed', periodDays: GRACE, action: 'delete', enforcedBy: 'accountErasure',
    onAccountClosure: 'Deleted after the grace period (included in the data export first).', basis: 'Feature of the account.', decision: 'engineering_default',
  },
  {
    id: 'directory.profiles', models: ['Worker', 'Business', 'BusinessListing', 'Storefront', 'StorefrontDomain', 'Promotion', 'AgencyProfile'], personalData: true,
    data: 'Public service-provider, business, storefront and agency profiles: names, phone, email, photo, address, custom domains, offers.',
    trigger: 'accountClosed', periodDays: GRACE, action: 'delete', enforcedBy: 'accountErasure',
    onAccountClosure: 'Taken down at closure (custom domains released). After the grace period deleted, or — where a booking, payment or coupon refers to it — kept with contact details removed.',
    basis: 'Contract while published.', decision: 'engineering_default',
  },
  {
    id: 'reviews.public', models: ['Review', 'BusinessReview'], personalData: true,
    data: 'Published reviews and the author name.', trigger: 'accountClosed', periodDays: GRACE, action: 'anonymise', enforcedBy: 'accountErasure',
    onAccountClosure: 'The author name is replaced with "Deleted User" after the grace period; the review text stays with the listing.',
    basis: 'Legitimate interest of other users in honest reviews.', decision: 'engineering_default',
  },
  {
    id: 'enquiries', models: ['Lead', 'Viewing', 'BusinessInquiry'], personalData: true,
    data: 'Enquiries and viewing requests with the name, phone and email given.', trigger: 'updatedAt', periodDays: RETENTION_DAYS.enquiry, action: 'delete', enforcedBy: 'purge',
    onAccountClosure: "After the grace period the enquirer's contact details are removed from leads and viewings, and business enquiries are deleted.",
    basis: 'Only needed while the enquiry is live, plus a year of history.', decision: 'engineering_default',
  },

  // ─── Moderation ───
  {
    id: 'moderation.dismissed', models: ['ContentReport'], appliesTo: 'Reports dismissed with no action', personalData: true,
    data: 'Reporter id, report text and IP address.', trigger: 'handledAt', periodDays: RETENTION_DAYS.dismissedContentReport, action: 'delete', enforcedBy: 'ttl', ttlField: 'handledAt',
    onAccountClosure: 'Reporter id and IP removed after the grace period.', basis: 'Abuse handling.', decision: 'engineering_default',
  },
  {
    id: 'moderation.actioned', models: ['ContentReport', 'PropertyReview'], appliesTo: 'Open and actioned reports, and listing review decisions', personalData: true,
    data: 'Reports that led to action, suspensions, and moderator decisions on listings.', trigger: 'handledAt', periodDays: null, action: 'retain', enforcedBy: 'none',
    onAccountClosure: "The reporter's id and IP are removed after the grace period; the decision record is retained.",
    basis: 'OWNER/LEGAL: how long to keep moderation and suspension records — to be confirmed. Kept and not used for any other purpose meanwhile.', decision: 'owner_legal_pending',
  },
  {
    id: 'moderation.complaintLog', models: ['ComplaintLog'], personalData: true,
    data: 'Redacted complaint text for model review.', trigger: 'createdAt', periodDays: RETENTION_DAYS.complaintLog, action: 'delete', enforcedBy: 'ttl', ttlField: 'createdAt',
    onAccountClosure: 'Not linked to an account id; expires on its own.', basis: 'Quality review of the complaint classifier.', decision: 'engineering_default',
  },

  // ─── Affiliates ───
  {
    id: 'affiliates.profile', models: ['AffiliateProfile', 'AffiliateAttribution'], personalData: true,
    data: 'Affiliate code, and referral records naming the referred account and session.', trigger: 'accountClosed', periodDays: GRACE, action: 'delete', enforcedBy: 'accountErasure',
    onAccountClosure: "After the grace period the referred account and session are removed from referral records, and the affiliate profile is deleted once no commission is unpaid.",
    basis: 'Contract with the affiliate.', decision: 'engineering_default',
  },

  // ─── Analytics and content ───
  {
    id: 'analytics.registry', models: ['RegistryPageView'], personalData: true,
    data: 'Hashed IP address, browser and referrer.', trigger: 'createdAt', periodDays: RETENTION_DAYS.registryPageView, action: 'delete', enforcedBy: 'ttl', ttlField: 'createdAt',
    onAccountClosure: 'Not linked to an account.', basis: 'Year-on-year usage statistics.', decision: 'engineering_default',
  },
  {
    id: 'analytics.storefront', models: ['StorefrontEvent'], personalData: true,
    data: 'Hashed visitor id and session id.', trigger: 'createdAt', periodDays: RETENTION_DAYS.storefrontEvent, action: 'delete', enforcedBy: 'ttl', ttlField: 'createdAt',
    onAccountClosure: 'Not linked to an account.', basis: 'Seller analytics.', decision: 'engineering_default',
  },
  {
    id: 'analytics.valuation', models: ['ValuationLog'], personalData: true,
    data: 'Valuation inputs and the requesting account id.', trigger: 'createdAt', periodDays: RETENTION_DAYS.valuationLog, action: 'delete', enforcedBy: 'ttl', ttlField: 'createdAt',
    onAccountClosure: 'Expires on its own.', basis: 'Pricing-model evidence.', decision: 'engineering_default',
  },
  {
    id: 'content.blog', models: ['BlogPost'], personalData: true,
    data: 'Articles and the author byline.', trigger: 'accountClosed', periodDays: GRACE, action: 'anonymise', enforcedBy: 'accountErasure',
    onAccountClosure: "After the grace period a closed storefront's posts are deleted and other posts lose the author's name and id.",
    basis: 'Published content.', decision: 'engineering_default',
  },

  // ─── Erasure ledger ───
  {
    id: 'erasure.ledger', models: ['ErasureLedger'], personalData: true,
    data: 'The id of an erased account or record, and storage ids of erased files — never names, emails or phone numbers.',
    trigger: 'expiresAt', periodDays: 0, action: 'delete', enforcedBy: 'ttl', ttlField: 'expiresAt',
    onAccountClosure: 'Written at closure; kept for the backup window plus 30 days after the erasure completes, so deletions can be re-applied to a restored backup.',
    basis: 'Legal obligation to honour erasure after a backup restore.', decision: 'engineering_default',
  },

  // ─── Not personal data ───
  {
    id: 'system.catalogue',
    models: ['BootstrapState', 'CronLock', 'JobRun', 'LegalArticle', 'LegalDocument', 'PlanEntitlement', 'SubscriptionPackage', 'StoreProduct', 'SponsorshipProduct', 'InsuranceProduct', 'InvestmentProduct', 'InvestmentPartner', 'ReviewerOrganization'],
    personalData: false,
    data: 'Configuration, catalogues, legal texts and job bookkeeping.', trigger: 'none', periodDays: null, action: 'retain', enforcedBy: 'none',
    onAccountClosure: 'Not linked to an account.', basis: 'Not personal data.', decision: 'not_personal',
  },
]

/** Rules the daily purge job enforces (services/retentionPurge.ts). */
export const purgeRules = () => RETENTION_SCHEDULE.filter((rule) => rule.enforcedBy === 'purge')

export const retentionRule = (id: string) => {
  const rule = RETENTION_SCHEDULE.find((candidate) => candidate.id === id)
  if (!rule) throw new Error(`Unknown retention rule ${id}`)
  return rule
}

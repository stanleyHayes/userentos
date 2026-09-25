/**
 * How long personal data with no legal reason to be kept indefinitely is kept
 * (Act 843: no longer than the purpose requires). One place, so the privacy
 * notice can quote these periods; change a period here, not in a model.
 *
 * Enforced by MongoDB TTL indexes on the named model (removal runs within
 * about a minute of expiry) or, for AuditLog, by the daily scheduler purge.
 * Changing a TTL period on an existing collection needs the index rebuilt
 * (collMod or drop + recreate) — Mongoose does not alter an existing index.
 *
 * Deliberately NOT here — kept for the life of the account, then removed by
 * account erasure (services/accountErasure.ts, 30 days after deletion), or
 * retained as financial/contract records pending the statutory retention
 * review: agreements and signature evidence, payments and receipts, payouts,
 * wallet ledgers and credits, financing/loan/insurance records, disputes,
 * move-outs, actioned content reports and suspensions.
 */
const DAYS = 24 * 60 * 60

export const RETENTION_DAYS = {
  /** Public registry page views (hashed IP, user agent, referrer): 13 months, a year-on-year view. */
  registryPageView: 395,
  /** In-app notifications the user has read. */
  readNotification: 365,
  /** Notifications never read: two years after they were last touched. */
  unreadNotification: 730,
  /** Abuse reports dismissed with no action (reporter id, text, IP), after handling. */
  dismissedContentReport: 365,
  /** Raw payment/payout provider webhook payloads: dispute investigation window. */
  webhookEvent: 90,
  /** App-store notification delivery dedupe records, after processing. */
  storeNotification: 30,
  /** Redacted dispute complaints queued for model review. */
  complaintLog: 180,
  /** Storefront analytics events. */
  storefrontEvent: 400,
  /** Rent valuation requests and outcomes (pricing-model evidence). */
  valuationLog: 730,
  /** Security/audit trail (includes IP addresses): purged daily by the scheduler. */
  auditLog: 730,
} as const

export type RetentionKey = keyof typeof RETENTION_DAYS

/** TTL index `expireAfterSeconds` for a retention period. */
export const ttlSeconds = (key: RetentionKey) => RETENTION_DAYS[key] * DAYS

export const retentionCutoff = (key: RetentionKey, now = Date.now()) => new Date(now - RETENTION_DAYS[key] * DAYS * 1000)

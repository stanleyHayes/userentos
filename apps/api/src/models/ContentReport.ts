/**
 * User-submitted abuse reports (spec §6 "add abuse reporting and admin
 * takedown", §15 abuse controls).
 *
 * Anything a seller or an author can publish — a listing, a storefront, a post,
 * a review — can be reported by whoever sees it. Reports are the input to the
 * admin takedown queue; they never take an item down on their own, because
 * report volume is trivially gameable by a competitor.
 */
import mongoose, { Schema, type Document } from 'mongoose'

/**
 * What can be reported.
 *
 * Deliberately limited to targets the admin queue can actually action today.
 * `user` is missing because there is no account-suspension mechanism yet — a
 * resolution that claims to have suspended an account while the account keeps
 * working would be worse than not offering the option.
 */
export const REPORT_TARGET_TYPES = ['property', 'storefront', 'blog_post', 'review'] as const
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number]

/**
 * Why. Kept short and mutually understandable rather than legalistic — a
 * renter picking from this list is not a lawyer, and the free-text `details`
 * field carries the specifics.
 */
export const REPORT_REASONS = [
  'scam_or_fraud',
  'misleading_listing',
  'not_available',
  'offensive_content',
  'spam',
  'duplicate',
  'illegal',
  'other',
] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

export const REPORT_STATUSES = ['open', 'reviewing', 'actioned', 'dismissed'] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

/** What an admin did about it. 'none' is a dismissal with no action taken. */
export const REPORT_ACTIONS = ['none', 'warned', 'content_removed'] as const
export type ReportAction = (typeof REPORT_ACTIONS)[number]

export interface IContentReport extends Document {
  reporterId: string
  targetType: ReportTargetType
  targetId: string
  /** Denormalised so the queue can show what was reported without N lookups. */
  targetLabel?: string
  /** The owner of the reported item, resolved at report time. */
  targetOwnerId?: string
  reason: ReportReason
  details?: string
  status: ReportStatus
  action: ReportAction
  resolutionNote?: string
  handledBy?: string
  handledAt?: Date
  ipAddress?: string
  createdAt: Date
  updatedAt: Date
}

const contentReportSchema = new Schema<IContentReport>({
  reporterId: { type: String, required: true, index: true },
  targetType: { type: String, enum: REPORT_TARGET_TYPES, required: true },
  targetId: { type: String, required: true },
  targetLabel: String,
  targetOwnerId: { type: String, index: true },
  reason: { type: String, enum: REPORT_REASONS, required: true },
  details: { type: String, maxlength: 2000 },
  status: { type: String, enum: REPORT_STATUSES, default: 'open', index: true },
  action: { type: String, enum: REPORT_ACTIONS, default: 'none' },
  resolutionNote: String,
  handledBy: String,
  handledAt: Date,
  ipAddress: String,
}, { timestamps: true })

// The queue is always read as "oldest open first", per target.
contentReportSchema.index({ status: 1, createdAt: 1 })
contentReportSchema.index({ targetType: 1, targetId: 1, status: 1 })

/**
 * One open report per reporter per target.
 *
 * A partial index rather than a plain unique one: a reporter may legitimately
 * report the same listing again after their first report was resolved, but
 * filing the same open report twice is either a mis-click or an attempt to
 * inflate the count.
 */
contentReportSchema.index(
  { reporterId: 1, targetType: 1, targetId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['open', 'reviewing'] } } },
)

export const ContentReport = mongoose.model<IContentReport>('ContentReport', contentReportSchema)

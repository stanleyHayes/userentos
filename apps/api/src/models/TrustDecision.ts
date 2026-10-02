import mongoose, { Schema, type Document } from 'mongoose'
import { ttlSeconds } from '../config/retention.js'

/**
 * The TRUST-2 audit trail (spec §16): one record per message the contact
 * screen stopped, would have stopped in shadow mode, or nearly stopped.
 *
 * Never the message itself. `maskedExcerpt` keeps the shape of what was
 * written with every digit, email, link and handle removed, which is enough
 * for a reviewer to judge the decision and for the dataset to learn from, and
 * useless for recovering anyone's contact details. Ordinary allowed messages
 * leave no record.
 */
export const TRUST_CHANNELS = [
  'chat', 'enquiry', 'listing', 'website', 'blog', 'review', 'viewing', 'application', 'profile', 'other',
] as const
export type TrustChannel = (typeof TRUST_CHANNELS)[number]

export const TRUST_REVIEW_STATUSES = ['pending', 'appealed', 'upheld', 'overturned'] as const
export type TrustReviewStatus = (typeof TRUST_REVIEW_STATUSES)[number]

export interface ITrustDecision extends Document {
  authorId: string
  channel: TrustChannel
  conversationId?: string
  /** What was being saved, outside chat: 'property', 'storefront', 'blog_post'… */
  targetType?: string
  targetId?: string
  decision: 'ALLOW' | 'BLOCK'
  /** Whether the decision was applied: false in shadow mode or outside the rollout. */
  enforced: boolean
  mode: 'enforce' | 'shadow'
  reasonCodes: string[]
  /** What the block rested on: structure, context, phrase or model. */
  basis?: string
  /** The coarse reason the author was shown. */
  userReason?: string
  riskScore: number
  scores: { structure: number; intent: number; context: number }
  intentLabel?: string
  ruleHits: { detector: string; kind: string; confidence: number; view: string; obfuscated: boolean; masked: string }[]
  maskedExcerpt: string
  /**
   * A keyed HMAC of the text (services/trust/digest.ts), never reversible
   * without the server key. Lets a reviewer's "stopped by mistake" let the
   * same text through when the author sends it again.
   */
  textDigest?: string
  /** This message went through because a reviewer overturned an identical one. */
  overrideOf?: string
  /** Earlier messages that, with this one, made up a contact detail (§13). */
  contributingMessageIds: string[]
  versions: { model: string; normalizer: string; feature: string; policy: string }
  latencyMs: number
  /** The fallback path decided, not the full pipeline. */
  degraded: boolean
  review: {
    status: TrustReviewStatus
    appealNote?: string
    appealedAt?: Date
    reviewedBy?: string
    reviewedAt?: Date
    /** The reviewer's intent label, for the dataset (docs/trust/LABELING_GUIDE.md). */
    label?: string
    note?: string
  }
  createdAt: Date
}

const trustDecisionSchema = new Schema<ITrustDecision>({
  authorId: { type: String, required: true, index: true },
  channel: { type: String, enum: TRUST_CHANNELS, required: true },
  conversationId: String,
  targetType: String,
  targetId: String,
  decision: { type: String, enum: ['ALLOW', 'BLOCK'], required: true },
  enforced: { type: Boolean, required: true },
  mode: { type: String, enum: ['enforce', 'shadow'], required: true },
  reasonCodes: { type: [String], default: [] },
  basis: String,
  userReason: String,
  riskScore: { type: Number, required: true },
  scores: {
    structure: { type: Number, default: 0 },
    intent: { type: Number, default: 0 },
    context: { type: Number, default: 0 },
  },
  intentLabel: String,
  ruleHits: [{
    _id: false,
    detector: String,
    kind: String,
    confidence: Number,
    view: String,
    obfuscated: Boolean,
    masked: String,
  }],
  maskedExcerpt: { type: String, maxlength: 600, default: '' },
  textDigest: String,
  overrideOf: String,
  contributingMessageIds: { type: [String], default: [] },
  versions: {
    model: String,
    normalizer: String,
    feature: String,
    policy: String,
  },
  latencyMs: { type: Number, default: 0 },
  degraded: { type: Boolean, default: false },
  review: {
    status: { type: String, enum: TRUST_REVIEW_STATUSES, default: 'pending' },
    appealNote: { type: String, maxlength: 500 },
    appealedAt: Date,
    reviewedBy: String,
    reviewedAt: Date,
    label: String,
    note: { type: String, maxlength: 1000 },
  },
}, { timestamps: { createdAt: true, updatedAt: false } })

// Strike counting: an author's enforced blocks, newest first.
trustDecisionSchema.index({ authorId: 1, decision: 1, enforced: 1, createdAt: -1 })
// The review queue: appeals first, then everything else, newest first.
trustDecisionSchema.index({ 'review.status': 1, createdAt: -1 })
// "Stopped by mistake" lookups when the author sends the same text again.
trustDecisionSchema.index({ authorId: 1, textDigest: 1, 'review.status': 1 })
trustDecisionSchema.index({ createdAt: 1 }, { expireAfterSeconds: ttlSeconds('trustDecision') })

export const TrustDecision = mongoose.model<ITrustDecision>('TrustDecision', trustDecisionSchema)

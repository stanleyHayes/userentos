import mongoose, { Schema, type Document } from 'mongoose'

/**
 * One immutable record per moderation action on a property.
 *
 * Kept separate from the property itself so a resubmission never overwrites the
 * history: the spec requires that when an owner resubmits, "the new review cycle
 * is traceable and the prior review preserved". Reviewer identity, organization
 * and reason are captured at the moment of the decision.
 */
export type ReviewAction = 'submit' | 'claim' | 'approve' | 'reject' | 'request_changes' | 'withdraw' | 'suspend' | 'unsuspend' | 'archive' | 'assign'

export interface IPropertyReview extends Document {
  propertyId: string
  /** Increments each time the owner submits — groups actions into review cycles. */
  reviewVersion: number
  action: ReviewAction
  reviewerId: string
  /** Reviewer's organization: 'rentos' for platform staff, else the org id. */
  reviewerOrg: string
  /** Machine-readable reason code, required on reject. */
  reasonCode?: string
  /** Human-readable explanation shown to the owner. */
  note?: string
  /** Actionable issues the owner must fix (request_changes). */
  issues: string[]
  fromStatus: string
  toStatus: string
  createdAt: Date
}

const propertyReviewSchema = new Schema<IPropertyReview>({
  propertyId: { type: String, required: true, index: true },
  reviewVersion: { type: Number, required: true, default: 1 },
  action: { type: String, required: true, enum: ['submit', 'claim', 'approve', 'reject', 'request_changes', 'withdraw', 'suspend', 'unsuspend', 'archive', 'assign'] },
  reviewerId: { type: String, required: true },
  reviewerOrg: { type: String, required: true, default: 'rentos' },
  reasonCode: String,
  note: String,
  issues: { type: [String], default: [] },
  fromStatus: { type: String, required: true },
  toStatus: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } })

propertyReviewSchema.index({ propertyId: 1, createdAt: -1 })

export const PropertyReview = mongoose.model<IPropertyReview>('PropertyReview', propertyReviewSchema)

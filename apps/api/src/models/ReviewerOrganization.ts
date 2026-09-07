import mongoose, { Schema, type Document } from 'mongoose'

/**
 * An optional external authority that may review properties (spec §5.4, §8/P8).
 *
 * The whole point of this model is that it can be absent. With no active
 * organization, submissions go to the RentOS queue and publishing works
 * exactly as before — the spec's "private-first, government-ready" principle.
 */
export interface IReviewerOrganization extends Document {
  name: string
  slug: string
  kind: 'platform' | 'government' | 'partner'
  /**
   * advisory: their opinion is recorded but does not gate publication.
   * required: platform approval waits for them.
   * delegated: they decide, platform retains override.
   */
  reviewMode: 'advisory' | 'required' | 'delegated'
  isActive: boolean
  /** Restrict what they may review, e.g. by region. Empty = unrestricted. */
  scope: { regions: string[]; cities: string[] }
  permissions: string[]
  createdAt: Date
  updatedAt: Date
}

const reviewerOrganizationSchema = new Schema<IReviewerOrganization>({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true, lowercase: true },
  kind: { type: String, required: true, enum: ['platform', 'government', 'partner'], default: 'partner' },
  reviewMode: { type: String, required: true, enum: ['advisory', 'required', 'delegated'], default: 'advisory' },
  isActive: { type: Boolean, default: false, index: true },
  scope: { regions: { type: [String], default: [] }, cities: { type: [String], default: [] } },
  permissions: { type: [String], default: ['property.review.read'] },
}, { timestamps: true })

export const ReviewerOrganization = mongoose.model<IReviewerOrganization>('ReviewerOrganization', reviewerOrganizationSchema)

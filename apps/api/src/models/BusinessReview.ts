import mongoose, { Schema, type Document } from 'mongoose'

export interface IBusinessReview extends Document {
  businessId: string
  authorId: string
  authorName: string
  rating: number
  review?: string
  /** Set by an admin acting on an abuse report; hidden and not averaged. */
  removed?: boolean
  removedReason?: string
  createdAt: Date
  updatedAt: Date
}

const businessReviewSchema = new Schema<IBusinessReview>(
  {
    businessId: { type: String, required: true, index: true },
    authorId: { type: String, required: true },
    authorName: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    review: String,
    removed: { type: Boolean, default: false },
    removedReason: String,
  },
  { timestamps: true },
)

// One review per user per business — re-posting updates the existing review.
businessReviewSchema.index({ businessId: 1, authorId: 1 }, { unique: true })

export const BusinessReview = mongoose.model<IBusinessReview>('BusinessReview', businessReviewSchema)

import mongoose, { Schema, type Document } from 'mongoose'

export interface IReview extends Document {
  propertyId: string
  userId: string
  userName: string
  rating: number // 1-5
  title: string
  content: string
  pros: string[]
  cons: string[]
  wouldRecommend: boolean
  landlordResponsive: number // 1-5
  maintenance: number // 1-5
  valueForMoney: number // 1-5
  neighborhood: number // 1-5
  verified: boolean // was this tenant actually in an agreement for this property
}

const reviewSchema = new Schema<IReview>({
  propertyId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  title: { type: String, required: true },
  content: { type: String, required: true },
  pros: [String],
  cons: [String],
  wouldRecommend: { type: Boolean, default: true },
  landlordResponsive: { type: Number, min: 1, max: 5, default: 3 },
  maintenance: { type: Number, min: 1, max: 5, default: 3 },
  valueForMoney: { type: Number, min: 1, max: 5, default: 3 },
  neighborhood: { type: Number, min: 1, max: 5, default: 3 },
  verified: { type: Boolean, default: false },
}, { timestamps: true })

// One review per user per property
reviewSchema.index({ propertyId: 1, userId: 1 }, { unique: true })

export const Review = mongoose.model<IReview>('Review', reviewSchema)

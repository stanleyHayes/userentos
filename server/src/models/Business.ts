import mongoose, { Schema, type Document } from 'mongoose'

export type BusinessCategory = 'furniture' | 'appliances' | 'internet' | 'moving' | 'cleaning' | 'other'

export const BUSINESS_CATEGORIES: BusinessCategory[] = ['furniture', 'appliances', 'internet', 'moving', 'cleaning', 'other']

export interface IBusiness extends Document {
  ownerId: string
  name: string
  category: BusinessCategory
  description?: string
  phone: string
  email?: string
  city: string
  address?: string
  isVerified: boolean
  /** Admin KYC approval gate — new profiles land as 'pending'. */
  approvalStatus: 'pending' | 'approved' | 'rejected'
  approvedBy?: string
  approvedAt?: Date
  rejectionReason?: string
  viewCount: number
  ratingAvg: number
  reviewCount: number
  subscriptionTier: 'free' | 'featured' | 'growth'
  featuredUntil?: Date
  createdAt: Date
  updatedAt: Date
}

const businessSchema = new Schema<IBusiness>(
  {
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    category: { type: String, enum: BUSINESS_CATEGORIES, required: true, index: true },
    description: String,
    phone: { type: String, required: true },
    email: String,
    city: { type: String, required: true, index: true },
    address: String,
    isVerified: { type: Boolean, default: false },
    approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    approvedBy: String,
    approvedAt: Date,
    rejectionReason: String,
    viewCount: { type: Number, default: 0 },
    ratingAvg: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    subscriptionTier: { type: String, enum: ['free', 'featured', 'growth'], default: 'free' },
    featuredUntil: Date,
  },
  { timestamps: true },
)

export const Business = mongoose.model<IBusiness>('Business', businessSchema)

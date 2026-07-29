import mongoose, { Schema, type Document } from 'mongoose'

export type ListingType = 'product' | 'service' | 'discount'

export interface IBusinessListing extends Document {
  businessId: string
  title: string
  description?: string
  type: ListingType
  price?: number
  promoText?: string
  isActive: boolean
  viewCount: number
  images: string[]
  stockQuantity?: number
  newMoverOnly: boolean
  createdAt: Date
  updatedAt: Date
}

const businessListingSchema = new Schema<IBusinessListing>(
  {
    businessId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: String,
    type: { type: String, enum: ['product', 'service', 'discount'], required: true },
    price: Number,
    promoText: String,
    isActive: { type: Boolean, default: true },
    viewCount: { type: Number, default: 0 },
    images: { type: [String], default: [] },
    stockQuantity: { type: Number, min: 0 },
    newMoverOnly: { type: Boolean, default: false },
  },
  { timestamps: true },
)

export const BusinessListing = mongoose.model<IBusinessListing>('BusinessListing', businessListingSchema)

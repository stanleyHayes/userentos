import mongoose, { Schema, type Document } from 'mongoose'

export type InquiryStatus = 'new' | 'contacted' | 'won' | 'lost'

export interface IBusinessInquiry extends Document {
  businessId: string
  listingId?: string
  requesterId: string
  requesterName: string
  requesterPhone: string
  requesterEmail?: string
  message?: string
  status: InquiryStatus
  createdAt: Date
  updatedAt: Date
}

const businessInquirySchema = new Schema<IBusinessInquiry>(
  {
    businessId: { type: String, required: true, index: true },
    listingId: String,
    requesterId: { type: String, required: true, index: true },
    requesterName: { type: String, required: true },
    requesterPhone: { type: String, required: true },
    requesterEmail: String,
    message: String,
    status: { type: String, enum: ['new', 'contacted', 'won', 'lost'], default: 'new', index: true },
  },
  { timestamps: true },
)

businessInquirySchema.index({ businessId: 1, status: 1, createdAt: -1 })

export const BusinessInquiry = mongoose.model<IBusinessInquiry>('BusinessInquiry', businessInquirySchema)

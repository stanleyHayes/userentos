import mongoose, { Schema, type Document } from 'mongoose'

export type RenewalOfferStatus = 'pending' | 'accepted' | 'declined'

export interface IRenewalOffer extends Document {
  agreementId: string
  landlordId: string
  tenantId: string
  proposedRent: number
  proposedEndDate: string
  message?: string
  status: RenewalOfferStatus
  respondedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const renewalOfferSchema = new Schema<IRenewalOffer>(
  {
    agreementId: { type: String, required: true, index: true },
    landlordId: { type: String, required: true, index: true },
    tenantId: { type: String, required: true, index: true },
    proposedRent: { type: Number, required: true, min: 0 },
    proposedEndDate: { type: String, required: true },
    message: String,
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending', index: true },
    respondedAt: Date,
  },
  { timestamps: true },
)

export const RenewalOffer = mongoose.model<IRenewalOffer>('RenewalOffer', renewalOfferSchema)

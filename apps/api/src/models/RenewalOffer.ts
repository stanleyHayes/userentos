import mongoose, { Schema, type Document } from 'mongoose'
import { signatureEvidenceSchema, type ISignatureEvidence } from './Agreement.js'

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
  /**
   * Agreement version the offer was made against, and the SHA-256 of the
   * renewed terms (that version + 1). A renewal is a new version of the
   * lease: both parties sign exactly these terms (Act 772) before they apply.
   * Absent on offers made before signed renewals.
   */
  agreementVersion?: number
  termsHash?: string
  landlordEvidence?: ISignatureEvidence
  tenantEvidence?: ISignatureEvidence
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
    agreementVersion: Number,
    termsHash: String,
    landlordEvidence: signatureEvidenceSchema,
    tenantEvidence: signatureEvidenceSchema,
  },
  { timestamps: true },
)

export const RenewalOffer = mongoose.model<IRenewalOffer>('RenewalOffer', renewalOfferSchema)

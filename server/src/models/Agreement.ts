import mongoose, { Schema, type Document } from 'mongoose'

export interface IAgreement extends Document {
  propertyId: string
  landlordId: string
  tenantId: string
  status: string
  startDate: string
  endDate: string
  rentAmount: number
  securityDeposit: number
  advanceMonths: number
  terms: string[]
  specialConditions: string[]
  landlordSignature?: string
  tenantSignature?: string
  complianceFlags: { type: string; message: string; clause?: string; law?: string }[]
  version: number
  // Renewal tracking
  renewalStatus: 'none' | 'landlord_declined' | 'tenant_declined' | 'pending' | 'renewed'
  renewalDeclinedBy?: string
  renewalDeclinedAt?: Date
  /** ISO timestamp of last lease-expiry reminder (idempotency for scheduler) */
  lastLeaseReminderAt?: string
}

const agreementSchema = new Schema<IAgreement>({
  propertyId: { type: String, required: true, index: true },
  landlordId: { type: String, required: true, index: true },
  tenantId: { type: String, required: true, index: true },
  status: { type: String, required: true, enum: ['draft', 'pending_signatures', 'active', 'expired', 'terminated', 'disputed'], default: 'draft' },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  rentAmount: { type: Number, required: true },
  securityDeposit: { type: Number, default: 0 },
  advanceMonths: { type: Number, default: 0 },
  terms: [String],
  specialConditions: [String],
  landlordSignature: String,
  tenantSignature: String,
  complianceFlags: [{
    type: { type: String },
    message: String,
    clause: String,
    law: String,
  }],
  version: { type: Number, default: 1 },
  // Renewal tracking
  renewalStatus: { type: String, enum: ['none', 'landlord_declined', 'tenant_declined', 'pending', 'renewed'], default: 'none' },
  renewalDeclinedBy: String,
  renewalDeclinedAt: Date,
  lastLeaseReminderAt: String,
}, { timestamps: true })

// Performance indexes
agreementSchema.index({ status: 1, endDate: 1 })
agreementSchema.index({ landlordId: 1, status: 1 })
agreementSchema.index({ tenantId: 1, status: 1 })

export const Agreement = mongoose.model<IAgreement>('Agreement', agreementSchema)

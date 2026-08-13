import mongoose, { Schema, type Document } from 'mongoose'
import type { EntityApprovalStatus } from './FinancierProfile.js'

export interface IInsuranceProviderProfile extends Document {
  userId: string
  institutionName: string
  licenseNumber?: string
  companyRegistrationNo?: string
  contactEmail: string
  contactPhone: string
  address?: string
  /** Admin KYC approval gate — new profiles land as 'pending'. */
  approvalStatus: EntityApprovalStatus
  approvedBy?: string
  approvedAt?: Date
  rejectionReason?: string
  createdAt: Date
  updatedAt: Date
}

const insuranceProviderProfileSchema = new Schema<IInsuranceProviderProfile>({
  userId: { type: String, required: true, unique: true, index: true },
  institutionName: { type: String, required: true },
  licenseNumber: String,
  companyRegistrationNo: String,
  contactEmail: { type: String, required: true },
  contactPhone: { type: String, required: true },
  address: String,
  approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  approvedBy: String,
  approvedAt: Date,
  rejectionReason: String,
}, { timestamps: true })

export const InsuranceProviderProfile = mongoose.model<IInsuranceProviderProfile>('InsuranceProviderProfile', insuranceProviderProfileSchema)

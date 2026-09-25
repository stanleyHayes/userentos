import mongoose, { Schema, type Document } from 'mongoose'
import { type EntityApprovalStatus, requireVerifiedLicence } from './FinancierProfile.js'

export interface IInsuranceProviderProfile extends Document {
  userId: string
  institutionName: string
  /** NIC licence number. Required before approval; approval is the admin's attestation it was checked. */
  licenseNumber?: string
  licenseVerifiedBy?: string
  licenseVerifiedAt?: Date
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
  licenseNumber: { type: String, trim: true },
  licenseVerifiedBy: String,
  licenseVerifiedAt: Date,
  companyRegistrationNo: String,
  contactEmail: { type: String, required: true },
  contactPhone: { type: String, required: true },
  address: String,
  approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  approvedBy: String,
  approvedAt: Date,
  rejectionReason: String,
}, { timestamps: true })

insuranceProviderProfileSchema.pre('validate', function () { requireVerifiedLicence(this) })

export const InsuranceProviderProfile = mongoose.model<IInsuranceProviderProfile>('InsuranceProviderProfile', insuranceProviderProfileSchema)

/** Providers whose products may be sold right now: approved with a verified licence. */
export async function verifiedInsuranceProviderIds(): Promise<Set<string>> {
  const profiles = await InsuranceProviderProfile.find({ approvalStatus: 'approved', licenseNumber: { $type: 'string', $ne: '' }, licenseVerifiedAt: { $exists: true } }).select('_id').lean()
  return new Set(profiles.map((p) => p._id.toString()))
}

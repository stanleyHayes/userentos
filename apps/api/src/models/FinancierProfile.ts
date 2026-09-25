import mongoose, { Schema, type Document } from 'mongoose'

export type EntityApprovalStatus = 'pending' | 'approved' | 'rejected'

interface LicensedProfile {
  approvalStatus: EntityApprovalStatus
  licenseNumber?: string
  licenseVerifiedBy?: string
  licenseVerifiedAt?: Date
  approvedBy?: string
  approvedAt?: Date
  invalidate(path: string, message: string): unknown
}

/**
 * A regulated institution can't be approved without a licence number, and
 * approving it is the admin's attestation that the licence was checked with the
 * regulator — recorded here so "approved" and "licence verified" never diverge.
 */
export function requireVerifiedLicence(doc: LicensedProfile) {
  if (doc.approvalStatus !== 'approved') {
    doc.licenseVerifiedBy = undefined
    doc.licenseVerifiedAt = undefined
    return
  }
  if (!doc.licenseNumber?.trim()) {
    doc.invalidate('licenseNumber', 'A licence number is required before this profile can be approved')
    return
  }
  if (!doc.licenseVerifiedAt) {
    doc.licenseVerifiedAt = doc.approvedAt ?? new Date()
    doc.licenseVerifiedBy = doc.approvedBy
  }
}

export interface IFinancierProfile extends Document {
  userId: string
  institutionName: string
  licenseNumber?: string
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

const financierProfileSchema = new Schema<IFinancierProfile>({
  userId: { type: String, required: true, unique: true, index: true },
  institutionName: { type: String, required: true },
  licenseNumber: String,
  contactEmail: { type: String, required: true },
  contactPhone: { type: String, required: true },
  address: String,
  approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  approvedBy: String,
  approvedAt: Date,
  rejectionReason: String,
}, { timestamps: true })

export const FinancierProfile = mongoose.model<IFinancierProfile>('FinancierProfile', financierProfileSchema)

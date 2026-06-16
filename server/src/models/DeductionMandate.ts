import mongoose, { Schema, type Document } from 'mongoose'

export interface IDeductionMandate extends Document {
  employmentId: string
  employerId: string
  employeeId: string
  allocationType: 'rent' | 'savings' | 'loan_repayment' | 'wallet_topup'
  targetEntityId?: string
  targetEntityType?: 'agreement' | 'savings_plan' | 'financing_contract' | 'wallet'
  targetLabel?: string
  amountType: 'fixed' | 'percentage'
  amount: number
  startDate: string
  endDate?: string
  noticePeriodDays: number
  signatureHash: string
  signedAt: string
  status: 'pending' | 'active' | 'paused' | 'revoked' | 'expired'
  approvedByEmployerAt?: string
  approvedBy?: string
  revokedAt?: string
  revokedReason?: string
}

const mandateSchema = new Schema<IDeductionMandate>({
  employmentId: { type: String, required: true, index: true },
  employerId: { type: String, required: true, index: true },
  employeeId: { type: String, required: true, index: true },
  allocationType: { type: String, required: true, enum: ['rent', 'savings', 'loan_repayment', 'wallet_topup'] },
  targetEntityId: String,
  targetEntityType: { type: String, enum: ['agreement', 'savings_plan', 'financing_contract', 'wallet'] },
  targetLabel: String,
  amountType: { type: String, required: true, enum: ['fixed', 'percentage'], default: 'fixed' },
  amount: { type: Number, required: true, min: 0 },
  startDate: { type: String, required: true },
  endDate: String,
  noticePeriodDays: { type: Number, default: 7, min: 0, max: 90 },
  signatureHash: { type: String, required: true },
  signedAt: { type: String, required: true },
  status: { type: String, required: true, enum: ['pending', 'active', 'paused', 'revoked', 'expired'], default: 'pending' },
  approvedByEmployerAt: String,
  approvedBy: String,
  revokedAt: String,
  revokedReason: String,
}, { timestamps: true })

export const DeductionMandate = mongoose.model<IDeductionMandate>('DeductionMandate', mandateSchema)

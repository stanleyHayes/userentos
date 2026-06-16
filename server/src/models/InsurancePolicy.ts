import mongoose, { Schema, type Document } from 'mongoose'

export type InsurancePolicyStatus = 'pending' | 'active' | 'lapsed' | 'cancelled' | 'claimed'
export type InsuranceClaimStatus = 'pending' | 'approved' | 'rejected' | 'paid'

export interface IInsuranceClaim {
  id: string
  filedAt: string
  amount: number
  status: InsuranceClaimStatus
  description: string
  notes?: string
  payoutAmount?: number
  decidedBy?: string
  decidedAt?: string
}

export interface IInsurancePolicy extends Document {
  userId: string
  productId: string
  agreementId?: string
  propertyId?: string
  startDate: string
  endDate: string
  monthlyPremium: number
  status: InsurancePolicyStatus
  policyNumber: string
  lastPaidAt?: string
  claims: IInsuranceClaim[]
}

const claimSchema = new Schema<IInsuranceClaim>(
  {
    id: { type: String, required: true },
    filedAt: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'approved', 'rejected', 'paid'],
      default: 'pending',
    },
    description: { type: String, required: true },
    notes: String,
    payoutAmount: { type: Number, min: 0 },
    decidedBy: String,
    decidedAt: String,
  },
  { _id: false },
)

const insurancePolicySchema = new Schema<IInsurancePolicy>(
  {
    userId: { type: String, required: true, index: true },
    productId: { type: String, required: true, index: true },
    agreementId: String,
    propertyId: String,
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    monthlyPremium: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'active', 'lapsed', 'cancelled', 'claimed'],
      default: 'pending',
      index: true,
    },
    policyNumber: { type: String, required: true, unique: true },
    lastPaidAt: String,
    claims: { type: [claimSchema], default: [] },
  },
  { timestamps: true },
)

export const InsurancePolicy = mongoose.model<IInsurancePolicy>(
  'InsurancePolicy',
  insurancePolicySchema,
)

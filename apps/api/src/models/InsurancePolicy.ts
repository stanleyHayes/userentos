import mongoose, { Schema, type Document } from 'mongoose'

export type InsurancePolicyStatus = 'pending' | 'active' | 'lapsed' | 'cancelled' | 'claimed'
export type InsuranceClaimStatus = 'pending' | 'approved' | 'rejected' | 'paid'

export interface IInsuranceClaim {
  id: string
  filedAt: string
  /** When the loss happened — must fall inside the paid-for cover period. */
  incidentDate?: string
  amount: number
  status: InsuranceClaimStatus
  description: string
  notes?: string
  payoutAmount?: number
  decidedBy?: string
  decidedAt?: string
  /** The insurer decides. An admin may only record the insurer's decision, with its reference. */
  decisionSource?: 'provider' | 'admin_recorded'
  providerReference?: string
  payoutReference?: string
  paidAt?: string
}

export interface IInsurancePolicy extends Document {
  userId: string
  productId: string
  providerId?: string
  agreementId?: string
  propertyId?: string
  startDate: string
  endDate: string
  monthlyPremium: number
  termMonths?: number
  /** The whole term's premium, paid up front — cover never outlasts what was paid for. */
  premiumPaid?: number
  status: InsurancePolicyStatus
  /** RentOS order reference. The insurer's own policy number is insurerPolicyNumber. */
  policyNumber: string
  insurerPolicyNumber?: string
  issuedBy?: string
  issuedAt?: string
  declineReason?: string
  lastPaidAt?: string
  claims: IInsuranceClaim[]
}

const claimSchema = new Schema<IInsuranceClaim>(
  {
    id: { type: String, required: true },
    filedAt: { type: String, required: true },
    incidentDate: String,
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
    decisionSource: { type: String, enum: ['provider', 'admin_recorded'] },
    providerReference: String,
    payoutReference: String,
    paidAt: String,
  },
  { _id: false },
)

const insurancePolicySchema = new Schema<IInsurancePolicy>(
  {
    userId: { type: String, required: true, index: true },
    productId: { type: String, required: true, index: true },
    providerId: { type: String, index: true },
    agreementId: String,
    propertyId: String,
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    monthlyPremium: { type: Number, required: true, min: 0 },
    termMonths: { type: Number, min: 1 },
    premiumPaid: { type: Number, min: 0 },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'active', 'lapsed', 'cancelled', 'claimed'],
      default: 'pending',
      index: true,
    },
    policyNumber: { type: String, required: true, unique: true },
    insurerPolicyNumber: String,
    issuedBy: String,
    issuedAt: String,
    declineReason: String,
    lastPaidAt: String,
    claims: { type: [claimSchema], default: [] },
  },
  { timestamps: true },
)

insurancePolicySchema.index({ 'claims.payoutReference': 1 }, { sparse: true })

export const InsurancePolicy = mongoose.model<IInsurancePolicy>(
  'InsurancePolicy',
  insurancePolicySchema,
)

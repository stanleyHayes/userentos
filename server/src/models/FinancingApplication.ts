import mongoose, { Schema, type Document } from 'mongoose'

export interface IFinancingApplication extends Document {
  applicantId: string
  applicantName?: string
  financierId: string
  offerId: string
  agreementId?: string
  propertyId?: string
  amountRequested: number
  tenureMonths: number
  purpose: string
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'withdrawn'
  decisionNotes?: string
  decidedBy?: string
  decidedAt?: string
  creditScoreAtApply?: number
  monthlyIncomeAtApply?: number
  employerId?: string
  willUsePayrollDeduction: boolean
}

const applicationSchema = new Schema<IFinancingApplication>({
  applicantId: { type: String, required: true, index: true },
  applicantName: String,
  financierId: { type: String, required: true, index: true },
  offerId: { type: String, required: true, index: true },
  agreementId: { type: String, index: true },
  propertyId: { type: String, index: true },
  amountRequested: { type: Number, required: true, min: 50 },
  tenureMonths: { type: Number, required: true, min: 1, max: 60 },
  purpose: { type: String, required: true, minlength: 5 },
  status: { type: String, required: true, enum: ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'withdrawn'], default: 'submitted' },
  decisionNotes: String,
  decidedBy: String,
  decidedAt: String,
  creditScoreAtApply: Number,
  monthlyIncomeAtApply: Number,
  employerId: String,
  willUsePayrollDeduction: { type: Boolean, default: false },
}, { timestamps: true })

export const FinancingApplication = mongoose.model<IFinancingApplication>('FinancingApplication', applicationSchema)

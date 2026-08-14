import mongoose, { Schema, type Document } from 'mongoose'

export interface IFinancingOffer extends Document {
  financierId: string
  name: string
  productType: 'rent_advance' | 'deposit_loan' | 'rent_to_own'
  description: string
  minAmount: number
  maxAmount: number
  minTenureMonths: number
  maxTenureMonths: number
  annualInterestRate: number
  processingFeePct: number
  lateFeePct: number
  minCreditScore: number
  requiresEmployment: boolean
  requiresPayrollDeduction: boolean
  active: boolean
}

const offerSchema = new Schema<IFinancingOffer>({
  financierId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  productType: { type: String, required: true, enum: ['rent_advance', 'deposit_loan', 'rent_to_own'] },
  description: { type: String, default: '' },
  minAmount: { type: Number, required: true, min: 50 },
  maxAmount: { type: Number, required: true, min: 50 },
  minTenureMonths: { type: Number, required: true, min: 1, max: 60 },
  maxTenureMonths: { type: Number, required: true, min: 1, max: 60 },
  annualInterestRate: { type: Number, required: true, min: 0, max: 100 },
  processingFeePct: { type: Number, default: 0, min: 0, max: 20 },
  lateFeePct: { type: Number, default: 0, min: 0, max: 50 },
  minCreditScore: { type: Number, default: 0 },
  requiresEmployment: { type: Boolean, default: true },
  requiresPayrollDeduction: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
}, { timestamps: true })

export const FinancingOffer = mongoose.model<IFinancingOffer>('FinancingOffer', offerSchema)

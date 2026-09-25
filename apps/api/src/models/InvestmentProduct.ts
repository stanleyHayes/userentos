import mongoose, { Schema, type Document } from 'mongoose'

/** A partner's product as configured by an admin. Rates are the partner's indicative figures, never a promise. */
export interface IInvestmentProduct extends Document {
  partnerId: string
  name: string
  type: 'treasury_bill' | 'government_bond'
  tenureDays: number
  indicativeAnnualRate?: number
  minAmount: number
  description: string
  riskWarning: string
  active: boolean
}

const investmentProductSchema = new Schema<IInvestmentProduct>({
  partnerId: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true },
  type: { type: String, required: true, enum: ['treasury_bill', 'government_bond'] },
  tenureDays: { type: Number, required: true, min: 1 },
  indicativeAnnualRate: { type: Number, min: 0 },
  minAmount: { type: Number, required: true, min: 1 },
  description: { type: String, default: '' },
  riskWarning: { type: String, required: true },
  active: { type: Boolean, default: false, index: true },
}, { timestamps: true })

export const InvestmentProduct = mongoose.model<IInvestmentProduct>('InvestmentProduct', investmentProductSchema)

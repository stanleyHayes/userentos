import mongoose, { Schema, type Document } from 'mongoose'

export interface IInvestment extends Document {
  userId: string
  type: 'treasury_bill' | 'government_bond'
  amount: number
  interestRate: number  // annual %
  tenure: number        // days
  startDate: string
  maturityDate: string
  status: 'active' | 'matured' | 'withdrawn' | 'pending'
  expectedReturn: number
  actualReturn?: number
  partnerId: string     // licensed investment firm ID
}

const investmentSchema = new Schema<IInvestment>({
  userId: { type: String, required: true, index: true },
  type: { type: String, required: true, enum: ['treasury_bill', 'government_bond'] },
  amount: { type: Number, required: true, min: 100 },
  interestRate: { type: Number, required: true },
  tenure: { type: Number, required: true },
  startDate: { type: String, required: true },
  maturityDate: { type: String, required: true },
  status: { type: String, required: true, enum: ['active', 'matured', 'withdrawn', 'pending'], default: 'pending' },
  expectedReturn: { type: Number, required: true },
  actualReturn: Number,
  partnerId: { type: String, required: true },
}, { timestamps: true })

export const Investment = mongoose.model<IInvestment>('Investment', investmentSchema)

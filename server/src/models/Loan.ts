import mongoose, { Schema, type Document } from 'mongoose'

export interface ILoan extends Document {
  userId: string
  agreementId: string
  amount: number
  interestRate: number
  tenure: number // months
  monthlyPayment: number
  totalRepayment: number
  amountPaid: number
  status: 'pending' | 'approved' | 'active' | 'repaid' | 'defaulted' | 'rejected'
  creditScoreAtApproval?: number
  disbursedAt?: string
  reason: string
}

const loanSchema = new Schema<ILoan>({
  userId: { type: String, required: true, index: true },
  agreementId: { type: String, required: true },
  amount: { type: Number, required: true, min: 50, max: 10000 },
  interestRate: { type: Number, required: true },
  tenure: { type: Number, required: true, min: 1, max: 12 },
  monthlyPayment: { type: Number, required: true },
  totalRepayment: { type: Number, required: true },
  amountPaid: { type: Number, default: 0 },
  status: { type: String, required: true, enum: ['pending', 'approved', 'active', 'repaid', 'defaulted', 'rejected'], default: 'pending' },
  creditScoreAtApproval: Number,
  disbursedAt: String,
  reason: { type: String, required: true },
}, { timestamps: true })

export const Loan = mongoose.model<ILoan>('Loan', loanSchema)

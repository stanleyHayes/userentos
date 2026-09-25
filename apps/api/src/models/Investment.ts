import mongoose, { Schema, type Document } from 'mongoose'

export type InvestmentStatus = 'pending' | 'active' | 'redemption_requested' | 'matured' | 'withdrawn' | 'rejected'

export interface IInvestment extends Document {
  userId: string
  type: 'treasury_bill' | 'government_bond'
  amount: number
  interestRate: number  // partner's indicative annual %, not guaranteed
  tenure: number        // days
  startDate: string
  maturityDate: string
  status: InvestmentStatus
  expectedReturn: number // indicative only
  actualReturn?: number
  partnerId: string     // InvestmentPartner id (legacy rows: a free-text firm id)
  productId?: string
  partnerName?: string
  /** The partner's confirmation that the money was placed. */
  partnerReference?: string
  confirmedBy?: string
  confirmedAt?: Date
  rejectionReason?: string
  redemptionRequestedAt?: Date
  /** The partner's payout, recorded by an admin — the only source of a wallet credit. */
  settlementReference?: string
  settledAmount?: number
  settledBy?: string
  settledAt?: Date
}

const investmentSchema = new Schema<IInvestment>({
  userId: { type: String, required: true, index: true },
  type: { type: String, required: true, enum: ['treasury_bill', 'government_bond'] },
  amount: { type: Number, required: true, min: 1 },
  interestRate: { type: Number, required: true },
  tenure: { type: Number, required: true },
  startDate: { type: String, required: true },
  maturityDate: { type: String, required: true },
  status: { type: String, required: true, enum: ['pending', 'active', 'redemption_requested', 'matured', 'withdrawn', 'rejected'], default: 'pending' },
  expectedReturn: { type: Number, required: true },
  actualReturn: Number,
  partnerId: { type: String, required: true },
  productId: String,
  partnerName: String,
  partnerReference: String,
  confirmedBy: String,
  confirmedAt: Date,
  rejectionReason: String,
  redemptionRequestedAt: Date,
  settlementReference: String,
  settledAmount: Number,
  settledBy: String,
  settledAt: Date,
}, { timestamps: true })

// One partner settlement backs one payout.
investmentSchema.index({ settlementReference: 1 }, { name: 'investment_settlement_reference', unique: true, partialFilterExpression: { settlementReference: { $type: 'string' } } })

export const Investment = mongoose.model<IInvestment>('Investment', investmentSchema)

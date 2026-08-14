import mongoose, { Schema, type Document } from 'mongoose'

export interface ICreditScore extends Document {
  userId: string
  score: number // 0-100
  factors: {
    paymentHistory: number    // 0-40 points
    savingsConsistency: number // 0-20 points
    agreementCompliance: number // 0-20 points
    disputeRecord: number      // 0-10 points
    accountAge: number         // 0-10 points
  }
  insights: string[]
  stats: Record<string, number>
  history: { score: number; date: string }[]
  calculatedAt: string
}

const creditScoreSchema = new Schema<ICreditScore>({
  userId: { type: String, required: true, unique: true, index: true },
  score: { type: Number, required: true, min: 0, max: 100 },
  factors: {
    paymentHistory: { type: Number, default: 0 },
    savingsConsistency: { type: Number, default: 0 },
    agreementCompliance: { type: Number, default: 0 },
    disputeRecord: { type: Number, default: 0 },
    accountAge: { type: Number, default: 0 },
  },
  insights: [String],
  stats: { type: Schema.Types.Mixed, default: {} },
  history: [{ score: Number, date: String }],
  calculatedAt: { type: String, required: true },
}, { timestamps: true })

export const CreditScore = mongoose.model<ICreditScore>('CreditScore', creditScoreSchema)

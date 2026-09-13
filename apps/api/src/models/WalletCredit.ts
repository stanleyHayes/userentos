import mongoose, { Schema } from 'mongoose'

export interface IWalletCredit {
  operationKey: string
  userId: string
  amount: number
  type: string
  reference: string
  state: 'pending' | 'completed'
  appliedAt?: Date
}
const schema = new Schema<IWalletCredit>({
  operationKey: { type: String, required: true, unique: true, immutable: true },
  userId: { type: String, required: true, immutable: true },
  amount: { type: Number, required: true, immutable: true },
  type: { type: String, required: true, immutable: true },
  reference: { type: String, required: true, immutable: true },
  state: { type: String, enum: ['pending', 'completed'], default: 'pending', required: true },
  appliedAt: Date,
}, { timestamps: true })
schema.index({ state: 1, createdAt: 1 })
export const WalletCredit = mongoose.model<IWalletCredit>('WalletCredit', schema)

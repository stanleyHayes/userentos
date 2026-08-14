import mongoose, { Schema, type Document } from 'mongoose'

export interface IWalletTransaction {
  type: string
  amount: number
  balanceAfter: number
  reference: string
  description: string
  createdAt: string
}

export interface IWallet extends Document {
  userId: string
  balance: number
  bankAccountRef?: string
  transactions: IWalletTransaction[]
}

const walletSchema = new Schema<IWallet>({
  userId: { type: String, required: true, unique: true, index: true },
  balance: { type: Number, default: 0 },
  bankAccountRef: String,
  transactions: [{
    type: { type: String, required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    reference: { type: String, required: true },
    description: { type: String, required: true },
    createdAt: { type: String, required: true },
  }],
}, { timestamps: true })

export const Wallet = mongoose.model<IWallet>('Wallet', walletSchema)

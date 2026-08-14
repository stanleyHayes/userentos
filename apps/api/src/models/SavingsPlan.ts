import mongoose, { Schema, type Document } from 'mongoose'

export interface ISavingsPlan extends Document {
  userId: string
  targetAmount: number
  currentAmount: number
  frequency: string
  contributionAmount: number
  startDate: string
  targetDate: string
  status: string
  linkedPropertyId?: string
  linkedAgreementId?: string
  autoDebit: boolean
  /** Last successful auto-debit — drives the frequency check (replaces scanning
   * the wallet's embedded transactions array). */
  lastAutoDebitAt?: string
}

const savingsPlanSchema = new Schema<ISavingsPlan>({
  userId: { type: String, required: true, index: true },
  targetAmount: { type: Number, required: true },
  currentAmount: { type: Number, default: 0 },
  frequency: { type: String, required: true, enum: ['daily', 'weekly', 'monthly'] },
  contributionAmount: { type: Number, required: true },
  startDate: { type: String, required: true },
  targetDate: { type: String, required: true },
  status: { type: String, required: true, enum: ['active', 'paused', 'completed', 'cancelled'], default: 'active' },
  linkedPropertyId: String,
  linkedAgreementId: String,
  autoDebit: { type: Boolean, default: false },
  lastAutoDebitAt: String,
}, { timestamps: true })

export const SavingsPlan = mongoose.model<ISavingsPlan>('SavingsPlan', savingsPlanSchema)

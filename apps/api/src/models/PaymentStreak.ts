import mongoose, { Schema, type Document } from 'mongoose'

export interface IPaymentStreakBreak {
  brokenAt: Date
  previousStreak: number
  reason?: string
}

export interface IPaymentStreak extends Document {
  userId: string
  currentStreak: number
  longestStreak: number
  /** YYYY-MM string of the last paid month */
  lastPaymentMonth?: string
  lastPaymentAt?: Date
  streakStartedAt?: Date
  breaks: IPaymentStreakBreak[]
}

const breakSchema = new Schema<IPaymentStreakBreak>({
  brokenAt: { type: Date, required: true },
  previousStreak: { type: Number, required: true },
  reason: String,
}, { _id: false })

const paymentStreakSchema = new Schema<IPaymentStreak>({
  userId: { type: String, required: true, unique: true, index: true },
  currentStreak: { type: Number, default: 0 },
  longestStreak: { type: Number, default: 0 },
  lastPaymentMonth: String,
  lastPaymentAt: Date,
  streakStartedAt: Date,
  breaks: { type: [breakSchema], default: [] },
}, { timestamps: true })

export const PaymentStreak = mongoose.model<IPaymentStreak>('PaymentStreak', paymentStreakSchema)

import mongoose, { Schema, type Document } from 'mongoose'

/**
 * A request to move money OUT of the platform to a user's own account.
 *
 * Lifecycle:
 *   requested  — user asked; wallet ALREADY debited (the funds are reserved,
 *                so the same balance cannot be requested twice)
 *   processing — an admin approved it and the PSP accepted the transfer
 *   paid       — PSP confirmed delivery by webhook (terminal)
 *   failed     — PSP rejected/reversed it, or an admin declined; the wallet
 *                has been credited back (terminal)
 *
 * The wallet is debited at request time and refunded on any terminal failure.
 * Doing it the other way round (debit on success) would let a user drain the
 * same balance through several concurrent requests.
 */
export const PAYOUT_STATUSES = ['requested', 'processing', 'paid', 'failed'] as const

export type PayoutStatus = (typeof PAYOUT_STATUSES)[number]

export interface IPayout extends Document {
  userId: string
  amount: number
  status: PayoutStatus
  /** Our reference, echoed by the PSP so webhooks can be correlated. */
  reference: string
  /** PSP transfer handle (Paystack TRF_xxx), set once the transfer is accepted. */
  providerRef?: string
  /** Snapshot of the destination at request time — the account may change later. */
  destination: {
    type: string
    accountNumber: string
    bankName: string
    accountName: string
    recipientCode: string
  }
  approvedBy?: string
  approvedAt?: Date
  paidAt?: Date
  failureReason?: string
  /** True once the wallet has been credited back, so a retry cannot double-refund. */
  refunded: boolean
  createdAt: Date
  updatedAt: Date
}

const payoutSchema = new Schema<IPayout>({
  userId: { type: String, required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  status: { type: String, required: true, enum: ['requested', 'processing', 'paid', 'failed'], default: 'requested', index: true },
  reference: { type: String, required: true, unique: true, index: true },
  providerRef: { type: String, index: true },
  destination: {
    type: { type: String, required: true },
    accountNumber: { type: String, required: true },
    bankName: { type: String, required: true },
    accountName: { type: String, required: true },
    recipientCode: { type: String, required: true },
  },
  approvedBy: String,
  approvedAt: Date,
  paidAt: Date,
  failureReason: String,
  refunded: { type: Boolean, default: false },
}, { timestamps: true })

export const Payout = mongoose.model<IPayout>('Payout', payoutSchema)

/** Statuses no webhook or admin action may move a payout out of. */
export const TERMINAL_PAYOUT_STATES = ['paid', 'failed'] as const

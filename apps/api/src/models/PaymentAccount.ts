import mongoose, { Schema, type Document } from 'mongoose'

/**
 * A seller's payout destination with the payment provider (spec §8.1, §12).
 *
 * Stores provider identifiers and MASKED bank metadata only. The spec is
 * explicit: never persist full banking credentials or provider secrets in
 * data a user can edit.
 */
export interface IPaymentAccount extends Document {
  ownerId: string
  provider: 'paystack'
  /** Provider handle used to split payments (Paystack ACCT_xxx). */
  subaccountCode?: string
  businessName: string
  bankCode: string
  bankName: string
  /** Last four digits only — enough to identify, useless if leaked. */
  accountNumberMasked: string
  /** Name the provider resolved for the account, not what the seller typed. */
  accountNameResolved?: string
  status: 'pending' | 'verifying' | 'ready' | 'failed' | 'disabled'
  readyToReceivePayments: boolean
  failureReason?: string
  verifiedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const paymentAccountSchema = new Schema<IPaymentAccount>({
  ownerId: { type: String, required: true, unique: true, index: true },
  provider: { type: String, required: true, enum: ['paystack'], default: 'paystack' },
  subaccountCode: { type: String, index: true },
  businessName: { type: String, required: true },
  bankCode: { type: String, required: true },
  bankName: { type: String, required: true },
  accountNumberMasked: { type: String, required: true },
  accountNameResolved: String,
  status: { type: String, enum: ['pending', 'verifying', 'ready', 'failed', 'disabled'], default: 'pending', index: true },
  readyToReceivePayments: { type: Boolean, default: false },
  failureReason: String,
  verifiedAt: Date,
}, { timestamps: true })

export const PaymentAccount = mongoose.model<IPaymentAccount>('PaymentAccount', paymentAccountSchema)

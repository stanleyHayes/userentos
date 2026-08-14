import mongoose, { Schema, type Document } from 'mongoose'

/**
 * Where a user gets paid out to — a mobile-money wallet or a Ghanaian bank
 * account. One per user.
 *
 * `recipientCode` is the PSP's handle for the destination (Paystack's
 * RCP_xxx). We store that rather than re-sending raw account details on every
 * transfer, and it is what makes a payout possible at all: without it the
 * payout rail has nowhere to send money.
 *
 * `accountName` is the name the PSP resolved for the account, NOT what the
 * user typed. It is the only defence against a fat-fingered digit sending
 * someone else's rent to a stranger, so it is always displayed back for
 * confirmation before a payout runs.
 */
export type PayoutAccountType = 'mobile_money' | 'ghipss'

export interface IPayoutAccount extends Document {
  userId: string
  type: PayoutAccountType
  /** MoMo phone number, or bank account number. */
  accountNumber: string
  /** PSP bank/telco code — from GET /payouts/destinations. */
  bankCode: string
  /** Human label for the telco or bank, cached for display. */
  bankName: string
  /** Account holder name as resolved by the PSP. */
  accountName: string
  /** PSP recipient handle (Paystack RCP_xxx). */
  recipientCode: string
  /** False when the PSP could not resolve the account — payouts stay blocked. */
  verified: boolean
  createdAt: Date
  updatedAt: Date
}

const payoutAccountSchema = new Schema<IPayoutAccount>({
  userId: { type: String, required: true, unique: true, index: true },
  type: { type: String, required: true, enum: ['mobile_money', 'ghipss'] },
  accountNumber: { type: String, required: true },
  bankCode: { type: String, required: true },
  bankName: { type: String, required: true },
  accountName: { type: String, required: true },
  recipientCode: { type: String, required: true },
  verified: { type: Boolean, default: false },
}, { timestamps: true })

export const PayoutAccount = mongoose.model<IPayoutAccount>('PayoutAccount', payoutAccountSchema)

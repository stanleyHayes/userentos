import mongoose, { Schema, type Document } from 'mongoose'

export type PaymentPurpose = 'rent' | 'wallet_deposit' | 'subscription'

export interface IPayment extends Document {
  /** Required for rent payments; absent for wallet deposits / subscriptions. */
  agreementId?: string
  tenantId: string
  /** Required for rent payments; absent for wallet deposits / subscriptions. */
  landlordId?: string
  amount: number
  method: string
  status: string
  reference: string
  /** What this payment funds. Only 'rent' involves an agreement/landlord. */
  purpose: PaymentPurpose
  /** Purpose-specific payload, e.g. { packageId } for subscriptions. */
  purposeMeta?: Record<string, unknown>
  /** Client-supplied idempotency key — retries return the original payment. */
  idempotencyKey?: string
  receiptUrl?: string
  paidAt?: string
  /** ISO timestamp of last reminder sent for this payment (idempotency for scheduler) */
  lastReminderAt?: string
  /** Provider-side correlator (e.g. MTN X-Reference-Id, Telecel transactionId, bank PSP ref). */
  providerRef?: string
  /** Raw provider status string for audit (e.g. SUCCESSFUL, REJECTED). */
  providerStatus?: string
  /** Reason from the provider on failure / decline. */
  failureReason?: string
  /** ISO timestamp of last reconciliation poll (used by scheduler). */
  lastProviderCheckAt?: string
}

const paymentSchema = new Schema<IPayment>({
  agreementId: { type: String, index: true },
  tenantId: { type: String, required: true, index: true },
  landlordId: { type: String, index: true },
  amount: { type: Number, required: true },
  method: { type: String, required: true, enum: ['mtn_momo', 'telecel_cash', 'airteltigo_money', 'bank_transfer'] },
  status: { type: String, required: true, enum: ['pending', 'processing', 'completed', 'failed', 'refunded'], default: 'pending' },
  reference: { type: String, required: true, unique: true },
  purpose: { type: String, required: true, enum: ['rent', 'wallet_deposit', 'subscription'], default: 'rent', index: true },
  purposeMeta: { type: Schema.Types.Mixed },
  idempotencyKey: { type: String, unique: true, sparse: true },
  receiptUrl: String,
  paidAt: String,
  lastReminderAt: String,
  providerRef: { type: String, index: true },
  providerStatus: String,
  failureReason: String,
  lastProviderCheckAt: String,
}, { timestamps: true })

// Performance indexes
paymentSchema.index({ status: 1, createdAt: -1 })
paymentSchema.index({ tenantId: 1, status: 1 })
paymentSchema.index({ landlordId: 1, status: 1 })
paymentSchema.index({ agreementId: 1, status: 1, createdAt: -1 })

export const Payment = mongoose.model<IPayment>('Payment', paymentSchema)

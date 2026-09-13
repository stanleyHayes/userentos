import type { RentReceipt } from '../services/payments/rentReceipt.js'
import type { SubscriptionTerms } from '../services/payments/subscriptionTerms.js'
import type { ReceiptContext } from '../services/payments/receiptContext.js'
import { rentPeriodError, type RentPeriod } from '../services/payments/rentPeriod.js'
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
  subscriptionTerms?: SubscriptionTerms
  subscriptionActivatedAt?: Date
  subscriptionActivationResult?: string
  subscriptionNextAttemptAt?: Date
  subscriptionCoverageStartsAt?: Date
  subscriptionCoverageEndsAt?: Date
  /** Client-supplied idempotency key — retries return the original payment. */
  idempotencyKey?: string
  /** Explicit allocation for new rent payments; absent on legacy records. */
  rentPeriod?: RentPeriod
  /** Names/premises at payment initiation, not a receipt or proof of settlement. */
  receiptContext?: ReceiptContext
  rentReceipt?: RentReceipt
  receiptUrl?: string
  receiptIssueNextAttemptAt?: Date
  receiptIssueClaim?: string
  receiptIssueAttempts?: number
  receiptIssueFailure?: string
  walletCreditIntent?: { version: number; operationKey: string; userId: string; amount: number; type: string; reference: string }
  walletCreditCompletedAt?: Date
  walletCreditNextAttemptAt?: Date
  paidAt?: string
  /** ISO timestamp of last reminder sent for this payment (idempotency for scheduler) */
  lastReminderAt?: string
  /** Provider-side correlator (e.g. MTN X-Reference-Id, Telecel transactionId, bank PSP ref). */
  providerRef?: string
  collectionSource?: 'mtn_momo' | 'telecel_cash' | 'airteltigo_money' | 'bank_transfer' | 'paystack' | 'simulated'
  /** Raw provider status string for audit (e.g. SUCCESSFUL, REJECTED). */
  providerStatus?: string
  providerInstructions?: string
  collectionInitiationUncertainAt?: Date
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
  subscriptionActivatedAt: Date,
  subscriptionActivationResult: { type: String, enum: ['applied', 'superseded', 'expired'] },
  subscriptionNextAttemptAt: Date,
  subscriptionCoverageStartsAt: { type: Date, immutable: true },
  subscriptionCoverageEndsAt: { type: Date, immutable: true },
  subscriptionTerms: { type: new Schema({
    version: { type: Number, enum: [1], required: true, immutable: true },
    capturedAt: { type: Date, required: true, immutable: true },
    packageId: { type: String, required: true, immutable: true },
    packageVersion: { type: Number, required: true, immutable: true },
    packageName: { type: String, required: true, immutable: true },
    amount: { type: Number, required: true, immutable: true },
    currency: { type: String, enum: ['GHS'], required: true, immutable: true },
    billingCycle: { type: String, enum: ['monthly', 'yearly'], required: true, immutable: true },
    benefits: { type: [String], required: true, immutable: true },
    featuresJson: { type: String, required: true, immutable: true },
  }, { _id: false }), immutable: true },
  idempotencyKey: { type: String, unique: true, sparse: true },
  rentPeriod: { type: new Schema({ startDate: { type: String, required: true, immutable: true }, endDate: { type: String, required: true, immutable: true } }, { _id: false }), immutable: true, validate: { validator: (period: RentPeriod | undefined) => !period || rentPeriodError(period) === null, message: 'Invalid rent period' } },
  receiptContext: { type: new Schema({
    version: { type: Number, enum: [1], required: true, immutable: true },
    capturedAt: { type: Date, required: true, immutable: true },
    tenantName: { type: String, required: true, immutable: true },
    landlordName: { type: String, required: true, immutable: true },
    propertyId: { type: String, required: true, immutable: true },
    propertyTitle: { type: String, required: true, immutable: true },
    premisesAddress: { type: String, required: true, immutable: true },
    furnished: { type: Boolean, required: true, immutable: true },
  }, { _id: false }), immutable: true },
  rentReceipt: { type: new Schema({
    number: { type: String, required: true, immutable: true },
    issuedAt: { type: Date, required: true, immutable: true },
    paymentReference: { type: String, required: true, immutable: true },
    amount: { type: Number, required: true, immutable: true },
    currency: { type: String, required: true, immutable: true },
    paidAt: { type: String, required: true, immutable: true },
    periodStart: { type: String, required: true, immutable: true },
    periodEnd: { type: String, required: true, immutable: true },
    tenantName: { type: String, required: true, immutable: true },
    landlordName: { type: String, required: true, immutable: true },
    propertyTitle: { type: String, required: true, immutable: true },
    premisesAddress: { type: String, required: true, immutable: true },
    furnished: { type: Boolean, required: true, immutable: true },
    contextCapturedAt: { type: Date, required: true, immutable: true },
  }, { _id: false }), immutable: true },
  receiptUrl: String,
  walletCreditIntent: { type: new Schema({
    version: { type: Number, enum: [1], required: true, immutable: true },
    operationKey: { type: String, required: true, immutable: true },
    userId: { type: String, required: true, immutable: true },
    amount: { type: Number, required: true, immutable: true },
    type: { type: String, required: true, immutable: true },
    reference: { type: String, required: true, immutable: true },
  }, { _id: false }), immutable: true },
  walletCreditCompletedAt: Date,
  walletCreditNextAttemptAt: Date,
  receiptIssueNextAttemptAt: Date,
  receiptIssueClaim: String,
  receiptIssueAttempts: { type: Number, default: 0 },
  receiptIssueFailure: { type: String, enum: ['details_or_state', 'temporary_failure'] },
  paidAt: String,
  lastReminderAt: String,
  providerRef: { type: String, index: true },
  collectionSource: { type: String, immutable: true, enum: ['mtn_momo', 'telecel_cash', 'airteltigo_money', 'bank_transfer', 'paystack', 'simulated'] },
  providerStatus: String,
  providerInstructions: String,
  collectionInitiationUncertainAt: Date,
  failureReason: String,
  lastProviderCheckAt: String,
}, { timestamps: true })

// Performance indexes
paymentSchema.index({ status: 1, createdAt: -1 })
paymentSchema.index({ purpose: 1, status: 1, 'subscriptionTerms.version': 1, subscriptionActivatedAt: 1, subscriptionNextAttemptAt: 1 })
paymentSchema.index({ 'walletCreditIntent.version': 1, walletCreditCompletedAt: 1, walletCreditNextAttemptAt: 1 })
paymentSchema.index({ purpose: 1, status: 1, receiptIssueNextAttemptAt: 1 })
paymentSchema.index({ tenantId: 1, status: 1 })
paymentSchema.index({ landlordId: 1, status: 1 })
paymentSchema.index({ agreementId: 1, status: 1, createdAt: -1 })

export const Payment = mongoose.model<IPayment>('Payment', paymentSchema)

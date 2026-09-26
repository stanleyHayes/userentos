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
  /** Client-supplied idempotency key — retries return the original payment. Unique per payer. */
  idempotencyKey?: string
  /**
   * Set while this payment is in flight for an obligation that may only have
   * one in-flight collection (a rent period, a paid subscription checkout).
   * Unique, and cleared by the conditional update that makes the payment
   * terminal, so a second checkout for the same obligation is refused until
   * this one settles or fails.
   */
  openCollectionKey?: string
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
  /** Reconciliation backoff: provider checks so far and when the next is due. */
  providerCheckAttempts?: number
  nextProviderCheckAt?: Date
  /** A verified success that arrived after the payment had been marked failed. */
  lateSuccessAt?: Date
  /** An admin reviewed the late success (routes/adminPayments.ts). */
  lateSuccessAcknowledgedAt?: Date
  /** Cumulative GHS the provider has refunded to the payer, and the refund events already applied. */
  refundedAmount?: number
  refundEventIds?: string[]
  refundedAt?: Date
  /**
   * The payer was refunded after the beneficiary's wallet was credited. The
   * credit is not clawed back automatically (the landlord may already have
   * withdrawn it); 'required' queues it for manual recovery.
   */
  refundRecovery?: 'required' | 'resolved'
  refundRecoveryAmount?: number
  /** The platform owes the payer a refund, e.g. a subscription payment superseded by another. Admin-issued. */
  refundStatus?: 'required' | 'refunded' | 'waived'
  refundReason?: string
  /** Chargeback state reported by the provider. */
  disputeStatus?: 'open' | 'resolved'
  disputedAt?: Date
  /** An admin reviewed the open chargeback; cleared when a new one opens. */
  disputeAcknowledgedAt?: Date
  disputeResolvedAt?: Date
  disputeResolution?: string
  /** Last manual resolution by an admin (routes/adminPayments.ts). */
  resolvedBy?: string
  resolvedAt?: Date
  resolutionNote?: string
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
  // Unique per payer, below — never globally, or one tenant's key could collide with another's.
  idempotencyKey: String,
  openCollectionKey: String,
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
  // Unique per collection source, below.
  providerRef: { type: String, index: true },
  collectionSource: { type: String, immutable: true, enum: ['mtn_momo', 'telecel_cash', 'airteltigo_money', 'bank_transfer', 'paystack', 'simulated'] },
  providerStatus: String,
  providerInstructions: String,
  collectionInitiationUncertainAt: Date,
  failureReason: String,
  lastProviderCheckAt: String,
  providerCheckAttempts: Number,
  nextProviderCheckAt: Date,
  lateSuccessAt: Date,
  lateSuccessAcknowledgedAt: Date,
  refundedAmount: Number,
  refundEventIds: { type: [String], default: undefined },
  refundedAt: Date,
  refundRecovery: { type: String, enum: ['required', 'resolved'] },
  refundRecoveryAmount: Number,
  refundStatus: { type: String, enum: ['required', 'refunded', 'waived'] },
  refundReason: String,
  disputeStatus: { type: String, enum: ['open', 'resolved'] },
  disputedAt: Date,
  disputeAcknowledgedAt: Date,
  disputeResolvedAt: Date,
  disputeResolution: String,
  resolvedBy: String,
  resolvedAt: Date,
  resolutionNote: String,
}, { timestamps: true })

// Performance indexes
paymentSchema.index({ status: 1, createdAt: -1 })
paymentSchema.index({ purpose: 1, status: 1, 'subscriptionTerms.version': 1, subscriptionActivatedAt: 1, subscriptionNextAttemptAt: 1 })
paymentSchema.index({ 'walletCreditIntent.version': 1, walletCreditCompletedAt: 1, walletCreditNextAttemptAt: 1 })
paymentSchema.index({ purpose: 1, status: 1, receiptIssueNextAttemptAt: 1 })
paymentSchema.index({ tenantId: 1, status: 1 })
paymentSchema.index({ landlordId: 1, status: 1 })
paymentSchema.index({ agreementId: 1, status: 1, createdAt: -1 })
// Reconciliation sweep: due non-terminal payments, earliest check first.
paymentSchema.index({ status: 1, nextProviderCheckAt: 1 })

/*
 * Uniqueness. src/scripts/syncPaymentIndexes.ts builds these in production
 * (autoIndex may be off) and drops the old global idempotencyKey index.
 */
// A retry key identifies one payer's attempt; two payers may pick the same key.
paymentSchema.index({ tenantId: 1, idempotencyKey: 1 }, { name: 'payment_idempotency_per_payer', unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } })
// One in-flight collection per obligation (see openCollectionKey).
paymentSchema.index({ openCollectionKey: 1 }, { name: 'payment_one_open_collection', unique: true, partialFilterExpression: { openCollectionKey: { $type: 'string' } } })
// A provider correlator names one payment on its rail; finalize refuses ambiguous matches.
// Legacy rows with no recorded source are left out rather than forced to agree.
paymentSchema.index({ collectionSource: 1, providerRef: 1 }, { name: 'payment_provider_ref_per_source', unique: true, partialFilterExpression: { providerRef: { $type: 'string' }, collectionSource: { $type: 'string' } } })

export const Payment = mongoose.model<IPayment>('Payment', paymentSchema)

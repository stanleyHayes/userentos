import mongoose, { Schema, type Document } from 'mongoose'

/**
 * A marketplace payment and its economics (spec §8.3).
 *
 * The fee percentage and amounts are SNAPSHOTTED at creation. The spec is
 * explicit that a later plan change must not rewrite historical economics, so
 * nothing here is recomputed from the seller's current plan.
 */
export type MarketplaceTransactionStatus =
  | 'initialized' | 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded' | 'disputed'

export interface IMarketplaceTransaction extends Document {
  /** Provider reference. Always server-generated — never a client value. */
  reference: string
  /**
   * The client's idempotency key, scoped to the buyer.
   *
   * This used to BE the provider reference, which let a caller name a
   * reference that already belonged to another collection (a wallet deposit
   * shares the same Paystack account) and have that charge verified as this
   * order's payment.
   */
  idempotencyKey?: string
  /**
   * True when this transaction's id was sent to the provider as metadata, so
   * settlement can prove the verified charge was initialized for THIS row.
   * Absent on rows created before the binding existed.
   */
  providerBound?: boolean
  buyerId?: string
  buyerEmail: string
  /** Absent on a platform charge (sponsorship), where there is no seller. */
  sellerId?: string
  storefrontId?: string
  propertyId?: string
  /** Set when this payment buys a sponsorship, so settling it can activate the campaign. */
  sponsorshipId?: string
  /** The service booking this payment settles, resolved server-side from the quote. */
  bookingId?: string
  purpose: string
  currency: string
  grossAmount: number
  /** Snapshot: the plan's fee percent at the moment of the transaction. */
  platformFeePercent: number
  platformFeeAmount: number
  sellerExpectedAmount: number
  /** Provider processing fee, when the provider reports it. */
  processorFeeAmount?: number
  /** Who bears the provider's fee — recorded, not assumed. */
  feeBearer: 'platform' | 'seller'
  discountAmount: number
  discountSource?: 'platform' | 'seller'
  couponCode?: string
  provider: 'paystack'
  providerReference?: string
  providerAccessCode?: string
  subaccountCode?: string
  status: MarketplaceTransactionStatus
  verifiedAt?: Date
  /** Provider event ids already applied — the idempotency guard. */
  processedEventIds: string[]
  settlementStatus: 'pending' | 'settled' | 'unknown'
  /**
   * `booking:<id>` or `sponsorship:<id>` while this checkout is open. Unique,
   * so one order has one open checkout; cleared when the checkout is paid,
   * fails or is abandoned.
   */
  openOrderKey?: string
  /** Why a checkout was closed without payment (provider failure, abandoned, expired). */
  failureReason?: string
  /** Reconciliation backoff for the settlement sweep. */
  reconcileAttempts?: number
  lastReconcileAt?: Date
  nextReconcileAt?: Date
  /** Cumulative GHS refunded by the provider, and the refund events already applied. */
  refundedAmount?: number
  refundEventIds?: string[]
  /**
   * The buyer is owed a refund: a second charge for an order already paid, or
   * a charge for an order no longer awaiting payment. Admin-issued. A charge
   * flagged this way never paid for its order, so refunding it leaves the
   * order alone.
   */
  refundStatus?: 'required' | 'refunded' | 'waived'
  refundReason?: string
  /** The reference of the transaction that had already paid this order. */
  duplicateOf?: string
  /** A verified success that arrived after this checkout had been closed as failed. */
  lateSuccessAt?: Date
  /** An admin reviewed the late success (routes/adminPayments.ts). */
  lateSuccessAcknowledgedAt?: Date
  /** Status to restore when a chargeback is resolved in the platform's favour. */
  preDisputeStatus?: MarketplaceTransactionStatus
  disputedAt?: Date
  /** An admin reviewed the open chargeback; cleared when a new one opens. */
  disputeAcknowledgedAt?: Date
  /** Last manual resolution by an admin (routes/adminPayments.ts). */
  resolvedBy?: string
  resolvedAt?: Date
  resolutionNote?: string
  createdAt: Date
  updatedAt: Date
}

const marketplaceTransactionSchema = new Schema<IMarketplaceTransaction>({
  reference: { type: String, required: true, unique: true, index: true },
  idempotencyKey: String,
  providerBound: Boolean,
  buyerId: String,
  buyerEmail: { type: String, required: true },
  // Not required: a platform charge has no seller to pay. Only queries
  // filter on this field; nothing dereferences it.
  sellerId: { type: String, index: true },
  storefrontId: String,
  propertyId: String,
  sponsorshipId: { type: String, index: true },
  bookingId: { type: String, index: true },
  purpose: { type: String, required: true, default: 'marketplace' },
  currency: { type: String, required: true, default: 'GHS' },
  grossAmount: { type: Number, required: true, min: 0 },
  platformFeePercent: { type: Number, required: true, min: 0, max: 100 },
  platformFeeAmount: { type: Number, required: true, min: 0 },
  sellerExpectedAmount: { type: Number, required: true, min: 0 },
  processorFeeAmount: Number,
  feeBearer: { type: String, enum: ['platform', 'seller'], default: 'platform' },
  discountAmount: { type: Number, default: 0, min: 0 },
  discountSource: { type: String, enum: ['platform', 'seller'] },
  couponCode: String,
  provider: { type: String, enum: ['paystack'], default: 'paystack' },
  providerReference: { type: String, index: true },
  providerAccessCode: String,
  subaccountCode: String,
  status: {
    type: String,
    enum: ['initialized', 'pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'disputed'],
    default: 'initialized',
    index: true,
  },
  verifiedAt: Date,
  processedEventIds: { type: [String], default: [] },
  settlementStatus: { type: String, enum: ['pending', 'settled', 'unknown'], default: 'pending' },
  openOrderKey: String,
  failureReason: String,
  reconcileAttempts: Number,
  lastReconcileAt: Date,
  nextReconcileAt: Date,
  refundedAmount: Number,
  refundEventIds: { type: [String], default: undefined },
  refundStatus: { type: String, enum: ['required', 'refunded', 'waived'] },
  refundReason: String,
  duplicateOf: String,
  lateSuccessAt: Date,
  lateSuccessAcknowledgedAt: Date,
  preDisputeStatus: { type: String, enum: ['initialized', 'pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'disputed'] },
  disputedAt: Date,
  disputeAcknowledgedAt: Date,
  resolvedBy: String,
  resolvedAt: Date,
  resolutionNote: String,
}, { timestamps: true })

// A replayed key returns the buyer's original transaction; another buyer's
// identical key is a different transaction, not a lookup into theirs.
marketplaceTransactionSchema.index(
  { buyerId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
)

// One open checkout per booking or sponsorship (see openOrderKey).
marketplaceTransactionSchema.index(
  { openOrderKey: 1 },
  { name: 'marketplace_one_open_order', unique: true, partialFilterExpression: { openOrderKey: { $type: 'string' } } },
)
// The settlement sweep: open checkouts, earliest due check first.
marketplaceTransactionSchema.index({ status: 1, nextReconcileAt: 1, createdAt: 1 })

export const MarketplaceTransaction = mongoose.model<IMarketplaceTransaction>('MarketplaceTransaction', marketplaceTransactionSchema)

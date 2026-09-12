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
  reference: string
  buyerId?: string
  buyerEmail: string
  sellerId: string
  storefrontId?: string
  propertyId?: string
  /** Set when this payment buys a sponsorship, so settling it can activate the campaign. */
  sponsorshipId?: string
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
  createdAt: Date
  updatedAt: Date
}

const marketplaceTransactionSchema = new Schema<IMarketplaceTransaction>({
  reference: { type: String, required: true, unique: true, index: true },
  buyerId: String,
  buyerEmail: { type: String, required: true },
  sellerId: { type: String, required: true, index: true },
  storefrontId: String,
  propertyId: String,
  sponsorshipId: { type: String, index: true },
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
}, { timestamps: true })

export const MarketplaceTransaction = mongoose.model<IMarketplaceTransaction>('MarketplaceTransaction', marketplaceTransactionSchema)

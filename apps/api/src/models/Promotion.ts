import mongoose, { Schema, type Document } from 'mongoose'

/**
 * A discount campaign and its coupon (spec §10).
 *
 * `fundingSource` distinguishes a platform-funded promotion from a
 * seller-funded one, because the spec requires the funding source and amount
 * to be snapshotted onto every transaction that uses it.
 */
export interface IPromotion extends Document {
  ownerId?: string
  storefrontId?: string
  fundingSource: 'platform' | 'seller'
  code: string
  type: 'percentage' | 'fixed'
  value: number
  startAt: Date
  endAt: Date
  /** Total redemptions allowed across all users. */
  usageLimit?: number
  /** Redemptions allowed per user. */
  perUserLimit?: number
  minimumSpend?: number
  eligiblePropertyIds: string[]
  usedCount: number
  status: 'active' | 'paused' | 'expired' | 'disabled'
  disabledReason?: string
  createdAt: Date
  updatedAt: Date
}

const promotionSchema = new Schema<IPromotion>({
  ownerId: { type: String, index: true },
  storefrontId: { type: String, index: true },
  fundingSource: { type: String, required: true, enum: ['platform', 'seller'], default: 'seller' },
  code: { type: String, required: true, unique: true, uppercase: true, index: true },
  type: { type: String, required: true, enum: ['percentage', 'fixed'] },
  value: { type: Number, required: true, min: 0 },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  usageLimit: Number,
  perUserLimit: Number,
  minimumSpend: Number,
  eligiblePropertyIds: { type: [String], default: [] },
  usedCount: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'paused', 'expired', 'disabled'], default: 'active', index: true },
  disabledReason: String,
}, { timestamps: true })

export const Promotion = mongoose.model<IPromotion>('Promotion', promotionSchema)

/** One redemption, used to enforce the per-user limit. */
export interface ICouponRedemption extends Document {
  promotionId: string
  code: string
  userId: string
  transactionRef?: string
  discountAmount: number
  createdAt: Date
}

const couponRedemptionSchema = new Schema<ICouponRedemption>({
  promotionId: { type: String, required: true, index: true },
  code: { type: String, required: true },
  userId: { type: String, required: true, index: true },
  transactionRef: String,
  discountAmount: { type: Number, required: true, min: 0 },
}, { timestamps: { createdAt: true, updatedAt: false } })

couponRedemptionSchema.index({ promotionId: 1, userId: 1 })

export const CouponRedemption = mongoose.model<ICouponRedemption>('CouponRedemption', couponRedemptionSchema)

/**
 * Coupon validation (spec §10).
 *
 * Validation is server-side and atomic at redemption: the spec requires the
 * server to "validate eligibility/limits atomically", so the usage counter is
 * incremented with a conditional update rather than a read-then-write.
 */
import { Promotion } from '../../models/Promotion.js'
import { CouponRedemption } from '../../models/Promotion.js'
import { round2 } from '../../utils/money.js'

export interface CouponContext {
  code: string
  userId: string
  amount: number
  sellerId?: string
  propertyId?: string
}

export interface CouponResult {
  valid: boolean
  reason?: string
  discountAmount: number
  promotionId?: string
  fundingSource?: 'platform' | 'seller'
}

/** Compute the discount without applying it. Safe to call from a preview. */
export async function validateCoupon(ctx: CouponContext): Promise<CouponResult> {
  const code = ctx.code.trim().toUpperCase()
  const promotion = await Promotion.findOne({ code }).lean()

  if (!promotion) return { valid: false, reason: 'That coupon code does not exist.', discountAmount: 0 }
  if (promotion.status !== 'active') return { valid: false, reason: 'This coupon is no longer active.', discountAmount: 0 }

  const now = new Date()
  if (now < new Date(promotion.startAt)) return { valid: false, reason: 'This coupon is not active yet.', discountAmount: 0 }
  if (now > new Date(promotion.endAt)) return { valid: false, reason: 'This coupon has expired.', discountAmount: 0 }

  if (promotion.minimumSpend && ctx.amount < promotion.minimumSpend) {
    return { valid: false, reason: `Spend at least GHS ${promotion.minimumSpend} to use this coupon.`, discountAmount: 0 }
  }
  if (promotion.usageLimit && promotion.usedCount >= promotion.usageLimit) {
    return { valid: false, reason: 'This coupon has been fully redeemed.', discountAmount: 0 }
  }
  if (promotion.eligiblePropertyIds.length && ctx.propertyId && !promotion.eligiblePropertyIds.includes(ctx.propertyId)) {
    return { valid: false, reason: 'This coupon does not apply to this listing.', discountAmount: 0 }
  }
  // A seller-funded coupon only applies to that seller's own listings.
  if (promotion.fundingSource === 'seller' && promotion.ownerId && ctx.sellerId && promotion.ownerId !== ctx.sellerId) {
    return { valid: false, reason: 'This coupon does not apply to this seller.', discountAmount: 0 }
  }

  if (promotion.perUserLimit) {
    const used = await CouponRedemption.countDocuments({ promotionId: String(promotion._id), userId: ctx.userId })
    if (used >= promotion.perUserLimit) {
      return { valid: false, reason: 'You have already used this coupon.', discountAmount: 0 }
    }
  }

  const raw = promotion.type === 'percentage'
    ? (ctx.amount * promotion.value) / 100
    : promotion.value

  // Never below zero: the spec forbids a coupon making the payable amount
  // negative, so the discount is capped at the amount itself.
  const discountAmount = round2(Math.min(Math.max(0, raw), ctx.amount))

  return {
    valid: true,
    discountAmount,
    promotionId: String(promotion._id),
    fundingSource: promotion.fundingSource,
  }
}

/**
 * Claim a redemption atomically.
 *
 * The conditional `$expr` guard means two concurrent redemptions of the last
 * remaining coupon cannot both succeed.
 */
export async function redeemCoupon(ctx: CouponContext, transactionRef?: string): Promise<CouponResult> {
  const result = await validateCoupon(ctx)
  if (!result.valid || !result.promotionId) return result

  const claimed = await Promotion.findOneAndUpdate(
    {
      _id: result.promotionId,
      status: 'active',
      $or: [
        { usageLimit: { $exists: false } },
        { usageLimit: null },
        { $expr: { $lt: ['$usedCount', '$usageLimit'] } },
      ],
    },
    { $inc: { usedCount: 1 } },
    { returnDocument: 'after' },
  )
  if (!claimed) {
    return { valid: false, reason: 'This coupon has just been fully redeemed.', discountAmount: 0 }
  }

  await CouponRedemption.create({
    promotionId: result.promotionId,
    code: ctx.code.trim().toUpperCase(),
    userId: ctx.userId,
    transactionRef,
    discountAmount: result.discountAmount,
  })

  return result
}

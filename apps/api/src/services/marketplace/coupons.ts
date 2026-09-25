/**
 * Coupon validation and redemption (spec §10).
 *
 * Validation is server-side and atomic at redemption: the spec requires the
 * server to "validate eligibility/limits atomically", so the usage counters
 * are incremented with a conditional update rather than a read-then-write.
 * Redemption happens only when the discounted payment settles.
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
  /**
   * Checkouts already started with this code that have not settled yet — the
   * buyer's own, and everyone's. A use is only recorded at settlement, so
   * without these several parallel checkouts could each pass validation for
   * a single-use coupon.
   */
  inFlight?: { mine: number; total: number }
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
  if (promotion.usageLimit && promotion.usedCount + (ctx.inFlight?.total ?? 0) >= promotion.usageLimit) {
    return { valid: false, reason: 'The remaining uses of this coupon are in checkouts that have not finished. Try again shortly.', discountAmount: 0 }
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
    if (used + (ctx.inFlight?.mine ?? 0) >= promotion.perUserLimit) {
      return { valid: false, reason: 'This coupon is already applied to a checkout you have not finished. Complete it, or try again in 30 minutes.', discountAmount: 0 }
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

export interface RedeemableCharge {
  reference: string
  buyerId?: string
  couponCode?: string
  discountAmount: number
}

export type RedeemOutcome =
  | { redeemed: true }
  | { redeemed: false; reason: 'no_coupon' | 'unknown_coupon' | 'limit_reached' }

/** A buyer id is spliced into a field path, so it must be a plain token. */
const SAFE_KEY = /^[A-Za-z0-9_-]{1,64}$/

/**
 * Record a coupon's use against the payment it discounted — called once, by
 * settlement, when that payment is confirmed paid.
 *
 * There is deliberately no other way to consume a coupon. A public "redeem"
 * endpoint accepted any code and any amount from any account, so anyone could
 * burn through another seller's limited coupon without buying anything, while
 * real checkouts only validated and never counted a use.
 *
 * The total and per-buyer limits are enforced by ONE conditional update, so
 * concurrent settlements cannot both take the last use. Status and dates are
 * not re-checked: the buyer was quoted and has paid the discounted price, and
 * the honest record of that is a redemption. A payment that settles after the
 * limit was reached by concurrent checkouts is recorded as over the limit for
 * review rather than silently counted or dropped.
 */
export async function redeemForTransaction(charge: RedeemableCharge): Promise<RedeemOutcome> {
  if (!charge.couponCode || !charge.buyerId || charge.discountAmount <= 0) return { redeemed: false, reason: 'no_coupon' }
  const code = charge.couponCode.trim().toUpperCase()
  const promotion = await Promotion.findOne({ code }).select('_id').lean()
  if (!promotion) return { redeemed: false, reason: 'unknown_coupon' }

  const perUser = SAFE_KEY.test(charge.buyerId) ? `perUserCounts.${charge.buyerId}` : null
  const claimed = await Promotion.findOneAndUpdate(
    {
      _id: promotion._id,
      $and: [
        { $or: [{ usageLimit: { $exists: false } }, { usageLimit: null }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }] },
        perUser
          ? { $or: [{ perUserLimit: { $exists: false } }, { perUserLimit: null }, { $expr: { $lt: [{ $ifNull: [`$${perUser}`, 0] }, '$perUserLimit'] } }] }
          : { $or: [{ perUserLimit: { $exists: false } }, { perUserLimit: null }] },
      ],
    },
    { $inc: { usedCount: 1, ...(perUser ? { [perUser]: 1 } : {}) } },
    { returnDocument: 'after' },
  )

  await CouponRedemption.create({
    promotionId: String(promotion._id),
    code,
    userId: charge.buyerId,
    transactionRef: charge.reference,
    discountAmount: charge.discountAmount,
    ...(claimed ? {} : { overLimit: true }),
  })
  return claimed ? { redeemed: true } : { redeemed: false, reason: 'limit_reached' }
}

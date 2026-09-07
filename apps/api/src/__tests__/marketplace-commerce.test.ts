import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Promotion, CouponRedemption } from '../models/Promotion.js'
import { AffiliateProfile, AffiliateAttribution, AffiliateCommission } from '../models/Affiliate.js'
import { validateCoupon, redeemCoupon } from '../services/marketplace/coupons.js'
import { recordAttribution, createCommission } from '../services/marketplace/affiliate.js'

vi.mock('../models/Promotion.js', () => ({
  Promotion: { findOne: vi.fn(), findOneAndUpdate: vi.fn() },
  CouponRedemption: { countDocuments: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({}) },
}))
vi.mock('../models/Affiliate.js', () => ({
  AffiliateProfile: { findOne: vi.fn() },
  AffiliateAttribution: { findOne: vi.fn(), create: vi.fn().mockImplementation(async (d) => ({ ...d, affiliateId: d.affiliateId })) },
  AffiliateCommission: { create: vi.fn().mockImplementation(async (d) => d), updateMany: vi.fn() },
}))

const promo = (over: Record<string, unknown> = {}) => ({
  _id: { toString: () => 'promo-1' },
  code: 'SAVE10', type: 'percentage', value: 10, status: 'active',
  startAt: new Date(Date.now() - 86400000), endAt: new Date(Date.now() + 86400000),
  usedCount: 0, eligiblePropertyIds: [], fundingSource: 'seller',
  ...over,
})
const mockPromo = (doc: unknown) => vi.mocked(Promotion.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(doc) } as never)

describe('coupons (spec §10)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(CouponRedemption.countDocuments).mockResolvedValue(0 as never)
  })

  it('applies a percentage discount', async () => {
    mockPromo(promo())
    const result = await validateCoupon({ code: 'SAVE10', userId: 'u1', amount: 1000 })
    expect(result.valid).toBe(true)
    expect(result.discountAmount).toBe(100)
  })

  it('never discounts below zero', async () => {
    mockPromo(promo({ type: 'fixed', value: 5000 }))
    const result = await validateCoupon({ code: 'BIG', userId: 'u1', amount: 100 })
    expect(result.discountAmount).toBe(100)
  })

  it('refuses an expired coupon', async () => {
    mockPromo(promo({ endAt: new Date(Date.now() - 1000) }))
    const result = await validateCoupon({ code: 'OLD', userId: 'u1', amount: 100 })
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/expired/i)
  })

  it('refuses a disabled coupon', async () => {
    mockPromo(promo({ status: 'disabled' }))
    expect((await validateCoupon({ code: 'X', userId: 'u1', amount: 100 })).valid).toBe(false)
  })

  it('enforces the minimum spend', async () => {
    mockPromo(promo({ minimumSpend: 500 }))
    expect((await validateCoupon({ code: 'X', userId: 'u1', amount: 100 })).valid).toBe(false)
    expect((await validateCoupon({ code: 'X', userId: 'u1', amount: 900 })).valid).toBe(true)
  })

  it('enforces the total usage limit', async () => {
    mockPromo(promo({ usageLimit: 5, usedCount: 5 }))
    expect((await validateCoupon({ code: 'X', userId: 'u1', amount: 100 })).valid).toBe(false)
  })

  it('enforces the per-user limit', async () => {
    mockPromo(promo({ perUserLimit: 1 }))
    vi.mocked(CouponRedemption.countDocuments).mockResolvedValue(1 as never)
    const result = await validateCoupon({ code: 'X', userId: 'u1', amount: 100 })
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/already used/i)
  })

  it('keeps a seller-funded coupon on that seller only', async () => {
    mockPromo(promo({ fundingSource: 'seller', ownerId: 'seller-a' }))
    expect((await validateCoupon({ code: 'X', userId: 'u1', amount: 100, sellerId: 'seller-b' })).valid).toBe(false)
    expect((await validateCoupon({ code: 'X', userId: 'u1', amount: 100, sellerId: 'seller-a' })).valid).toBe(true)
  })

  it('claims redemption atomically so the last coupon cannot go twice', async () => {
    mockPromo(promo({ usageLimit: 1 }))
    vi.mocked(Promotion.findOneAndUpdate).mockResolvedValue(null as never) // lost the race

    const result = await redeemCoupon({ code: 'X', userId: 'u1', amount: 100 })

    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/just been fully redeemed/i)
    expect(CouponRedemption.create).not.toHaveBeenCalled()

    const guard = vi.mocked(Promotion.findOneAndUpdate).mock.calls[0][0] as unknown as Record<string, unknown>
    expect(guard).toHaveProperty('$or')
  })
})

describe('affiliate (spec §11)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects and records a self-referral', async () => {
    vi.mocked(AffiliateProfile.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'aff-1', userId: 'u1', code: 'RGABC', status: 'active' }),
    } as never)

    const result = await recordAttribution({ code: 'RGABC', referredUserId: 'u1' })

    expect(result.accepted).toBe(false)
    expect(result.reason).toMatch(/yourself/i)
    expect(AffiliateAttribution.create).toHaveBeenCalledWith(
      expect.objectContaining({ rejectedReason: 'self_referral' }),
    )
  })

  it('keeps the first attribution when a second code arrives', async () => {
    vi.mocked(AffiliateProfile.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'aff-2', userId: 'other', code: 'RGXYZ', status: 'active' }),
    } as never)
    vi.mocked(AffiliateAttribution.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'attr-1', affiliateId: 'aff-1' }),
    } as never)

    const result = await recordAttribution({ code: 'RGXYZ', referredUserId: 'u2' })
    expect(result.accepted).toBe(false)
    expect(result.reason).toMatch(/already attributed/i)
  })

  it('refuses a suspended affiliate', async () => {
    vi.mocked(AffiliateProfile.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'aff-3', userId: 'u3', code: 'RGSUS', status: 'suspended' }),
    } as never)
    expect((await recordAttribution({ code: 'RGSUS', referredUserId: 'u9' })).accepted).toBe(false)
  })

  it('accepts a genuine referral', async () => {
    vi.mocked(AffiliateProfile.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'aff-4', userId: 'u4', code: 'RGOK', status: 'active' }),
    } as never)
    vi.mocked(AffiliateAttribution.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as never)

    expect((await recordAttribution({ code: 'RGOK', referredUserId: 'u5' })).accepted).toBe(true)
  })

  it('snapshots the commission rule so later changes do not rewrite earnings', async () => {
    await createCommission({
      affiliateId: 'aff-1', event: 'transaction',
      rule: { type: 'percentage', value: 10 }, baseAmount: 500, sourceRef: 'MKT-1',
    })

    expect(AffiliateCommission.create).toHaveBeenCalledWith(expect.objectContaining({
      amount: 50,
      ruleSnapshot: { type: 'percentage', value: 10 },
      status: 'pending',
    }))
  })

  it('computes a flat commission independently of the base amount', async () => {
    await createCommission({ affiliateId: 'aff-1', event: 'qualified_signup', rule: { type: 'flat', value: 25 } })
    expect(AffiliateCommission.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 25 }))
  })
})

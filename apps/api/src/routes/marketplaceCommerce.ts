/**
 * Sponsorships, promotions/coupons and the affiliate programme
 * (spec §9, §10, §11).
 *
 * Every seller-facing create path is entitlement-gated server-side, and
 * sponsorship is refused on a listing that is not approved — the spec forbids
 * sponsorship from bypassing moderation.
 */
import { Router } from 'express'
import { z } from 'zod'
import crypto from 'crypto'
import { authenticate, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { SponsorshipProduct, Sponsorship } from '../models/Sponsorship.js'
import { Promotion } from '../models/Promotion.js'
import { AffiliateProfile, AffiliateCommission } from '../models/Affiliate.js'
import { Property } from '../models/Property.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { recordAudit } from '../utils/audit.js'
import { requireEntitlement, requireQuota, EntitlementError } from '../services/entitlements.js'
import { validateCoupon, redeemCoupon } from '../services/marketplace/coupons.js'
import { recordAttribution } from '../services/marketplace/affiliate.js'

const router = Router()

function entitlementGuard(err: unknown, res: Parameters<typeof error>[0]): boolean {
  if (err instanceof EntitlementError) { error(res, err.message, 402); return true }
  return false
}

// ─── Sponsorship (§9) ───

router.get('/sponsorship/products', asyncHandler(async (_req, res) => {
  const items = await SponsorshipProduct.find({ isActive: true }).sort({ sortOrder: 1, price: 1 }).lean()
  success(res, { items: items.map((p) => ({ ...p, id: String(p._id) })), total: items.length })
}))

router.post('/sponsorship/products', authenticate, requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const schema = z.object({
    name: z.string().min(2).max(80),
    description: z.string().max(500).optional(),
    placement: z.enum(['search_top', 'homepage', 'category', 'city']),
    durationDays: z.number().int().min(1).max(365),
    price: z.number().min(0),
    targeting: z.object({
      cities: z.array(z.string()).optional(),
      regions: z.array(z.string()).optional(),
      propertyTypes: z.array(z.string()).optional(),
    }).optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const product = await SponsorshipProduct.create(parsed.data)
  await recordAudit(req, 'sponsorship.product_created', 'SponsorshipProduct', String(product._id), parsed.data)
  success(res, { ...product.toObject(), id: String(product._id) }, 'Sponsorship product created', 201)
}))

/**
 * Buy a sponsorship for one of your listings.
 *
 * Refused unless the listing is approved/published: sponsorship must never be
 * a way around moderation.
 */
router.post('/sponsorship/campaigns', authenticate, asyncHandler(async (req, res) => {
  const schema = z.object({ propertyId: z.string().min(1), productId: z.string().min(1) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const property = await Property.findById(parsed.data.propertyId).lean()
  if (!property) { error(res, 'Property not found', 404); return }
  if (property.landlordId !== req.user!.userId) { error(res, 'You can only sponsor your own listings', 403); return }
  if (!['approved', 'published'].includes(property.listingStatus ?? '')) {
    error(res, 'Only an approved listing can be sponsored', 409)
    return
  }

  const product = await SponsorshipProduct.findById(parsed.data.productId).lean()
  if (!product?.isActive) { error(res, 'Sponsorship product unavailable', 404); return }

  // Plan may include a number of free sponsorships.
  try {
    const activeCount = await Sponsorship.countDocuments({ ownerId: req.user!.userId, status: 'active' })
    await requireQuota(req.user!.userId, 'sponsorship.quota', activeCount, 'Sponsored listings')
  } catch (err) {
    if (entitlementGuard(err, res)) return
    throw err
  }

  const startAt = new Date()
  const endAt = new Date(startAt.getTime() + product.durationDays * 86_400_000)
  const campaign = await Sponsorship.create({
    propertyId: parsed.data.propertyId,
    ownerId: req.user!.userId,
    productId: parsed.data.productId,
    placement: product.placement,
    startAt, endAt,
    spend: product.price,
    status: product.price > 0 ? 'pending_payment' : 'active',
  })

  await recordAudit(req, 'sponsorship.created', 'Sponsorship', String(campaign._id), { propertyId: parsed.data.propertyId, spend: product.price })
  success(res, { ...campaign.toObject(), id: String(campaign._id) }, 'Sponsorship created', 201)
}))

router.get('/sponsorship/campaigns', authenticate, asyncHandler(async (req, res) => {
  const isAdmin = req.user!.roles.some((r) => ['admin', 'super_admin'].includes(r))
  const filter = isAdmin && req.query.all === 'true' ? {} : { ownerId: req.user!.userId }
  const items = await Sponsorship.find(filter).sort({ createdAt: -1 }).limit(100).lean()
  success(res, { items: items.map((s) => ({ ...s, id: String(s._id) })), total: items.length })
}))

/** Admin can pause a campaign independently of the listing (§9). */
router.post('/sponsorship/campaigns/:id/pause', authenticate, requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const schema = z.object({ reason: z.string().min(3).max(300), resume: z.boolean().default(false) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const campaign = await Sponsorship.findById(param(req.params.id))
  if (!campaign) { error(res, 'Campaign not found', 404); return }

  campaign.status = parsed.data.resume ? 'active' : 'paused'
  campaign.pausedReason = parsed.data.resume ? undefined : parsed.data.reason
  await campaign.save()

  await recordAudit(req, parsed.data.resume ? 'sponsorship.resumed' : 'sponsorship.paused', 'Sponsorship', String(campaign._id), { reason: parsed.data.reason })
  success(res, { id: String(campaign._id), status: campaign.status }, parsed.data.resume ? 'Campaign resumed' : 'Campaign paused')
}))

// ─── Promotions & coupons (§10) ───

router.post('/promotions', authenticate, asyncHandler(async (req, res) => {
  const schema = z.object({
    code: z.string().min(3).max(40),
    type: z.enum(['percentage', 'fixed']),
    value: z.number().positive(),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    usageLimit: z.number().int().positive().optional(),
    perUserLimit: z.number().int().positive().optional(),
    minimumSpend: z.number().min(0).optional(),
    eligiblePropertyIds: z.array(z.string()).max(200).default([]),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const isAdmin = req.user!.roles.some((r) => ['admin', 'super_admin'].includes(r))

  // A seller needs the entitlement; a platform admin runs platform-funded
  // campaigns and is not plan-gated.
  if (!isAdmin) {
    try {
      await requireEntitlement(req.user!.userId, 'promotion.enabled', 'Promotions and coupons')
    } catch (err) {
      if (entitlementGuard(err, res)) return
      throw err
    }
  }

  if (parsed.data.type === 'percentage' && parsed.data.value > 100) {
    error(res, 'A percentage discount cannot exceed 100%')
    return
  }
  if (parsed.data.endAt <= parsed.data.startAt) {
    error(res, 'The end date must be after the start date')
    return
  }

  const code = parsed.data.code.trim().toUpperCase()
  if (await Promotion.findOne({ code }).lean()) { error(res, 'That coupon code is taken', 409); return }

  const promotion = await Promotion.create({
    ...parsed.data,
    code,
    ownerId: isAdmin ? undefined : req.user!.userId,
    fundingSource: isAdmin ? 'platform' : 'seller',
  })

  await recordAudit(req, 'promotion.created', 'Promotion', String(promotion._id), { code, fundingSource: promotion.fundingSource })
  success(res, { ...promotion.toObject(), id: String(promotion._id) }, 'Promotion created', 201)
}))

router.get('/promotions', authenticate, asyncHandler(async (req, res) => {
  const isAdmin = req.user!.roles.some((r) => ['admin', 'super_admin'].includes(r))
  const filter = isAdmin && req.query.all === 'true' ? {} : { ownerId: req.user!.userId }
  const items = await Promotion.find(filter).sort({ createdAt: -1 }).limit(100).lean()
  success(res, { items: items.map((p) => ({ ...p, id: String(p._id) })), total: items.length })
}))

/** Preview a coupon without consuming it. */
router.post('/promotions/validate', authenticate, asyncHandler(async (req, res) => {
  const schema = z.object({
    code: z.string().min(1),
    amount: z.number().positive(),
    sellerId: z.string().optional(),
    propertyId: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const result = await validateCoupon({ ...parsed.data, userId: req.user!.userId })
  if (!result.valid) { error(res, result.reason ?? 'This coupon cannot be used', 422); return }
  success(res, result)
}))

/** Consume a coupon against a transaction. */
router.post('/promotions/redeem', authenticate, asyncHandler(async (req, res) => {
  const schema = z.object({
    code: z.string().min(1),
    amount: z.number().positive(),
    transactionRef: z.string().optional(),
    sellerId: z.string().optional(),
    propertyId: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const result = await redeemCoupon({ ...parsed.data, userId: req.user!.userId }, parsed.data.transactionRef)
  if (!result.valid) { error(res, result.reason ?? 'This coupon cannot be used', 422); return }
  success(res, result, 'Coupon applied')
}))

router.post('/promotions/:id/disable', authenticate, requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const schema = z.object({ reason: z.string().min(3).max(300) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const promotion = await Promotion.findById(param(req.params.id))
  if (!promotion) { error(res, 'Promotion not found', 404); return }

  promotion.status = 'disabled'
  promotion.disabledReason = parsed.data.reason
  await promotion.save()

  await recordAudit(req, 'promotion.disabled', 'Promotion', String(promotion._id), { reason: parsed.data.reason })
  success(res, { id: String(promotion._id), status: 'disabled' }, 'Promotion disabled')
}))

// ─── Affiliate (§11) ───

router.post('/affiliate/profile', authenticate, asyncHandler(async (req, res) => {
  try {
    await requireEntitlement(req.user!.userId, 'affiliate.enabled', 'Affiliate tools')
  } catch (err) {
    if (entitlementGuard(err, res)) return
    throw err
  }

  const existing = await AffiliateProfile.findOne({ userId: req.user!.userId }).lean()
  if (existing) { success(res, { ...existing, id: String(existing._id) }); return }

  const code = `RG${crypto.randomBytes(4).toString('hex').toUpperCase()}`
  const profile = await AffiliateProfile.create({ userId: req.user!.userId, code })
  success(res, { ...profile.toObject(), id: String(profile._id) }, 'Affiliate profile created', 201)
}))

router.get('/affiliate/profile', authenticate, asyncHandler(async (req, res) => {
  const profile = await AffiliateProfile.findOne({ userId: req.user!.userId }).lean()
  if (!profile) { success(res, null); return }

  const commissions = await AffiliateCommission.find({ affiliateId: String(profile._id) }).sort({ createdAt: -1 }).limit(100).lean()
  const payable = commissions.filter((c) => ['approved', 'payable'].includes(c.status)).reduce((s, c) => s + c.amount, 0)

  success(res, {
    ...profile,
    id: String(profile._id),
    referralLink: `https://userentos.com/?ref=${profile.code}`,
    commissions: commissions.map((c) => ({ ...c, id: String(c._id) })),
    payableTotal: payable,
  })
}))

/** Record a referral touch. Public: attribution happens before signup. */
router.post('/affiliate/attribution', asyncHandler(async (req, res) => {
  const schema = z.object({
    code: z.string().min(3).max(40),
    sessionId: z.string().max(120).optional(),
    source: z.string().max(80).optional(),
    campaign: z.string().max(80).optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const result = await recordAttribution({ ...parsed.data, referredUserId: req.user?.userId })
  if (!result.accepted) { error(res, result.reason ?? 'Referral not accepted', 422); return }
  success(res, result, 'Referral recorded')
}))

export default router

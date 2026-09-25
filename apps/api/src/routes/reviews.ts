import { Router } from 'express'
import { isValidObjectId, type Types } from 'mongoose'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { Review } from '../models/Review.js'
import { Agreement } from '../models/Agreement.js'
import { User } from '../models/User.js'
import { Property } from '../models/Property.js'
import { success, error } from '../utils/response.js'
import { param, escapeRegex } from '../utils/params.js'
import { screenText, NEUTRAL_REJECTION } from '../services/moderation/textFilter.js'
import { shouldReport, reportFlaggedContent } from '../services/moderation/autoReport.js'

const router = Router()

/*
 * Only verified reviews are shown or averaged. A review is verified when its
 * author held a signed tenancy for the property — see POST below, which now
 * refuses everyone else. Older rows written before that rule may be
 * unverified; they stay stored but are never displayed or counted.
 */
const VISIBLE = { removed: { $ne: true }, verified: true }

/** Agreement states that mean the tenancy actually happened: signed, then live or ended. */
const LIVED_IN = ['active', 'expired', 'terminated']

// Get reviews for a property + summary (paginated; summary computed in Mongo)
router.get('/property/:propertyId', async (req, res) => {
  const propertyId = param(req.params.propertyId)
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1))
  const pageSize = Math.min(50, Math.max(1, Math.floor(Number(req.query.pageSize) || 10)))
  const skip = (page - 1) * pageSize

  const [reviews, summaryAgg] = await Promise.all([
    // `removed` is set when an admin actions an abuse report; a removed review
    // must not appear anywhere a reader or the rating average can see it.
    Review.find({ propertyId, ...VISIBLE }).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(pageSize).lean(),
    Review.aggregate([
      { $match: { propertyId, ...VISIBLE } },
      { $group: {
        _id: null,
        count: { $sum: 1 },
        avgRating: { $avg: '$rating' },
        avgLandlord: { $avg: { $ifNull: ['$landlordResponsive', 3] } },
        avgMaintenance: { $avg: { $ifNull: ['$maintenance', 3] } },
        avgValue: { $avg: { $ifNull: ['$valueForMoney', 3] } },
        avgNeighborhood: { $avg: { $ifNull: ['$neighborhood', 3] } },
        recommend: { $sum: { $cond: ['$wouldRecommend', 1, 0] } },
        one: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
        two: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
        three: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
        four: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
        five: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
      } },
    ]),
  ])

  const s = summaryAgg[0] ?? {}
  const count = s.count ?? 0
  const items = reviews.map((r) => ({ ...r, id: (r._id as Types.ObjectId).toString() }))

  success(res, {
    reviews: items,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(count / pageSize)),
    summary: {
      count,
      avgRating: count > 0 ? Math.round((s.avgRating ?? 0) * 10) / 10 : 0,
      distribution: [s.one ?? 0, s.two ?? 0, s.three ?? 0, s.four ?? 0, s.five ?? 0],
      avgLandlord: count > 0 ? Math.round((s.avgLandlord ?? 3) * 10) / 10 : 0,
      avgMaintenance: count > 0 ? Math.round((s.avgMaintenance ?? 3) * 10) / 10 : 0,
      avgValue: count > 0 ? Math.round((s.avgValue ?? 3) * 10) / 10 : 0,
      avgNeighborhood: count > 0 ? Math.round((s.avgNeighborhood ?? 3) * 10) / 10 : 0,
      recommendPct: count > 0 ? Math.round(((s.recommend ?? 0) / count) * 100) : 0,
    },
  })
})

// Create review
router.post('/', authenticate, async (req, res) => {
  const schema = z.object({
    propertyId: z.string(),
    rating: z.number().int().min(1).max(5),
    title: z.string().min(1).max(160),
    content: z.string().min(10).max(5000),
    pros: z.array(z.string().max(200)).max(20).default([]),
    cons: z.array(z.string().max(200)).max(20).default([]),
    wouldRecommend: z.boolean().default(true),
    landlordResponsive: z.number().int().min(1).max(5).default(3),
    maintenance: z.number().int().min(1).max(5).default(3),
    valueForMoney: z.number().int().min(1).max(5).default(3),
    neighborhood: z.number().int().min(1).max(5).default(3),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const userId = req.user!.userId
  const property = isValidObjectId(parsed.data.propertyId)
    ? await Property.findById(parsed.data.propertyId).select('landlordId').lean()
    : null
  if (!property) { error(res, 'Property not found', 404); return }

  /*
   * Only someone who actually rented the place may review it.
   *
   * Anyone could review any property, a landlord could review their own, and
   * "verified" was granted for ANY agreement — a draft the landlord created
   * and nobody signed counted. Unverified reviews also counted in the average,
   * so the rating was whatever the loudest accounts said. The reviewer now
   * needs an agreement for this property that both parties signed and that is
   * live or has ended, and must not be the landlord or manager of it.
   */
  const tenancy = property.landlordId === userId ? null : await Agreement.exists({
    propertyId: parsed.data.propertyId,
    tenantId: userId,
    landlordId: { $ne: userId },
    status: { $in: LIVED_IN },
    tenantSignature: { $exists: true, $nin: [null, ''] },
    landlordSignature: { $exists: true, $nin: [null, ''] },
  })
  if (!tenancy) {
    error(res, 'Only tenants with a signed tenancy for this property can review it.', 403)
    return
  }

  // Check if user already reviewed
  const existing = await Review.findOne({ propertyId: parsed.data.propertyId, userId })
  if (existing) { error(res, 'You have already reviewed this property', 409); return }

  const screened = screenText(parsed.data.title, parsed.data.content, ...parsed.data.pros, ...parsed.data.cons)
  if (screened.action === 'reject') { error(res, NEUTRAL_REJECTION, 400); return }

  // Get user name
  const user = await User.findById(userId)
  const userName = user ? `${user.firstName} ${user.lastName}` : 'Anonymous'

  const review = await Review.create({
    ...parsed.data,
    userId,
    userName,
    // True by construction: the tenancy check above is the only way here.
    verified: true,
  })
  if (shouldReport(screened, 'public')) {
    void reportFlaggedContent({ targetType: 'review', targetId: review._id.toString(), ownerId: userId, label: parsed.data.title, verdict: screened })
  }

  success(res, { ...review.toObject(), id: review._id.toString() }, 'Review submitted', 201)
})

// Neighborhood insights for a city — aggregates the community's reviews of
// properties in the area (avg neighborhood score, recent voices).
// NOTE: registered before /property/:propertyId-style params are not affected
// since this is a distinct path.
router.get('/neighborhood/:city', async (req, res) => {
  const city = String(req.params.city)
  const properties = await Property.find({ 'address.city': new RegExp(`^${escapeRegex(city)}$`, 'i') }).select('_id title').lean()
  const propertyIds = properties.map((p) => (p._id as Types.ObjectId).toString())
  const titleOf = new Map(properties.map((p) => [(p._id as Types.ObjectId).toString(), p.title]))

  if (propertyIds.length === 0) {
    success(res, { city, reviewCount: 0, avgNeighborhood: 0, avgOverall: 0, recommendPct: 0, items: [] })
    return
  }

  const [agg, recent] = await Promise.all([
    Review.aggregate([
      { $match: { propertyId: { $in: propertyIds }, ...VISIBLE } },
      { $group: {
        _id: null,
        count: { $sum: 1 },
        avgNeighborhood: { $avg: { $ifNull: ['$neighborhood', 3] } },
        avgOverall: { $avg: '$rating' },
        recommend: { $sum: { $cond: ['$wouldRecommend', 1, 0] } },
      } },
    ]),
    Review.find({ propertyId: { $in: propertyIds }, ...VISIBLE }).sort({ createdAt: -1 }).limit(10).lean(),
  ])

  const s = agg[0] ?? { count: 0 }
  const count = s.count ?? 0
  success(res, {
    city,
    reviewCount: count,
    avgNeighborhood: count > 0 ? Math.round((s.avgNeighborhood ?? 3) * 10) / 10 : 0,
    avgOverall: count > 0 ? Math.round((s.avgOverall ?? 0) * 10) / 10 : 0,
    recommendPct: count > 0 ? Math.round(((s.recommend ?? 0) / count) * 100) : 0,
    items: recent.map((r) => ({
      id: (r._id as Types.ObjectId).toString(),
      propertyTitle: titleOf.get(r.propertyId) ?? null,
      userName: r.userName,
      rating: r.rating,
      neighborhood: r.neighborhood,
      title: r.title,
      content: r.content,
      verified: r.verified,
      createdAt: (r as { createdAt?: Date }).createdAt,
    })),
  })
})

// Delete own review
router.delete('/:id', authenticate, async (req, res) => {
  const review = await Review.findById(param(req.params.id))
  if (!review) { error(res, 'Review not found', 404); return }
  if (review.userId !== req.user!.userId) { error(res, 'Not authorized', 403); return }
  await review.deleteOne()
  success(res, null, 'Review deleted')
})

export default router

import { Router } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { Review } from '../models/Review.js'
import { Agreement } from '../models/Agreement.js'
import { User } from '../models/User.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'

const router = Router()

// Get reviews for a property + summary (paginated; summary computed in Mongo)
router.get('/property/:propertyId', async (req, res) => {
  const propertyId = param(req.params.propertyId)
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1))
  const pageSize = Math.min(50, Math.max(1, Math.floor(Number(req.query.pageSize) || 10)))
  const skip = (page - 1) * pageSize

  const [reviews, summaryAgg] = await Promise.all([
    Review.find({ propertyId }).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
    Review.aggregate([
      { $match: { propertyId } },
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
    title: z.string().min(1),
    content: z.string().min(10),
    pros: z.array(z.string()).default([]),
    cons: z.array(z.string()).default([]),
    wouldRecommend: z.boolean().default(true),
    landlordResponsive: z.number().int().min(1).max(5).default(3),
    maintenance: z.number().int().min(1).max(5).default(3),
    valueForMoney: z.number().int().min(1).max(5).default(3),
    neighborhood: z.number().int().min(1).max(5).default(3),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  // Check if user already reviewed
  const existing = await Review.findOne({ propertyId: parsed.data.propertyId, userId: req.user!.userId })
  if (existing) { error(res, 'You have already reviewed this property', 409); return }

  // Check if user was/is a tenant of this property
  const agreement = await Agreement.findOne({ propertyId: parsed.data.propertyId, tenantId: req.user!.userId })
  const verified = !!agreement

  // Get user name
  const user = await User.findById(req.user!.userId)
  const userName = user ? `${user.firstName} ${user.lastName}` : 'Anonymous'

  const review = await Review.create({
    ...parsed.data,
    userId: req.user!.userId,
    userName,
    verified,
  })

  success(res, { ...review.toObject(), id: review._id.toString() }, 'Review submitted', 201)
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

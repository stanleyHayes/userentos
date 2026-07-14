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

// Get reviews for a property + summary
router.get('/property/:propertyId', async (req, res) => {
  const propertyId = param(req.params.propertyId)
  const reviews = await Review.find({ propertyId }).sort({ createdAt: -1 }).lean()
  const items = reviews.map((r) => ({ ...r, id: (r._id as Types.ObjectId).toString() }))

  // Calculate summary
  const count = items.length
  const avgRating = count > 0 ? Math.round((items.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : 0
  const distribution = [0, 0, 0, 0, 0] // index 0 = 1 star, index 4 = 5 stars
  items.forEach((r) => { if (r.rating >= 1 && r.rating <= 5) distribution[r.rating - 1]++ })
  const avgLandlord = count > 0 ? Math.round((items.reduce((s, r) => s + (r.landlordResponsive ?? 3), 0) / count) * 10) / 10 : 0
  const avgMaintenance = count > 0 ? Math.round((items.reduce((s, r) => s + (r.maintenance ?? 3), 0) / count) * 10) / 10 : 0
  const avgValue = count > 0 ? Math.round((items.reduce((s, r) => s + (r.valueForMoney ?? 3), 0) / count) * 10) / 10 : 0
  const avgNeighborhood = count > 0 ? Math.round((items.reduce((s, r) => s + (r.neighborhood ?? 3), 0) / count) * 10) / 10 : 0
  const recommendPct = count > 0 ? Math.round((items.filter((r) => r.wouldRecommend).length / count) * 100) : 0

  success(res, {
    reviews: items,
    summary: {
      count, avgRating, distribution, avgLandlord, avgMaintenance, avgValue, avgNeighborhood, recommendPct,
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

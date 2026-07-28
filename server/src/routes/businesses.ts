import { Router } from 'express'
import { z } from 'zod'
import type { Types } from 'mongoose'
import { authenticate, requireRole } from '../middleware/auth.js'
import { Business, BUSINESS_CATEGORIES, type BusinessCategory } from '../models/Business.js'
import { BusinessListing } from '../models/BusinessListing.js'
import { BusinessInquiry } from '../models/BusinessInquiry.js'
import { BusinessReview } from '../models/BusinessReview.js'
import { User } from '../models/User.js'
import { success, error } from '../utils/response.js'
import { escapeRegex, param } from '../utils/params.js'
import { notify } from '../services/notify.js'
import { logger } from '../utils/logger.js'
import { summarizeInquiryStatuses } from '../services/businessAnalytics.js'

const router = Router()

const idOf = <T extends { _id: unknown }>(doc: T) => ({
  ...doc,
  id: (doc._id as Types.ObjectId).toString(),
})

/* ================================================================
   GET /api/businesses — public-ish directory (any signed-in user)
   Filters: category, city, search (name/description). Each item
   carries the business plus its ACTIVE listings.
   ================================================================ */
const listSchema = z.object({
  category: z.enum(BUSINESS_CATEGORIES as [BusinessCategory, ...BusinessCategory[]]).optional(),
  city: z.string().optional(),
  search: z.string().optional(),
})

router.get('/', authenticate, async (req, res) => {
  const parsed = listSchema.safeParse(req.query)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const { category, city, search } = parsed.data

  const filter: Record<string, unknown> = {}
  if (category) filter.category = category
  if (city) filter.city = new RegExp(`^${escapeRegex(city)}$`, 'i')
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i')
    filter.$or = [{ name: rx }, { description: rx }]
  }

  const businesses = await Business.find(filter).sort({ isVerified: -1, createdAt: -1 }).limit(60).lean()
  const ids = businesses.map((b) => (b._id as Types.ObjectId).toString())
  const listings = await BusinessListing.find({ businessId: { $in: ids }, isActive: true }).sort({ createdAt: -1 }).lean()

  const byBusiness = new Map<string, typeof listings>()
  for (const l of listings) {
    const arr = byBusiness.get(l.businessId) ?? []
    arr.push(l)
    byBusiness.set(l.businessId, arr)
  }

  success(res, {
    items: businesses.map((b) => ({
      business: idOf(b),
      listings: (byBusiness.get((b._id as Types.ObjectId).toString()) ?? []).map(idOf),
    })),
  })
})

/* ================================================================
   GET /api/businesses/me — my business profile + all my listings
   ================================================================ */
router.get('/me', authenticate, requireRole('business'), async (req, res) => {
  const business = await Business.findOne({ ownerId: req.user!.userId }).lean()
  if (!business) { success(res, { business: null, listings: [] }); return }
  const listings = await BusinessListing.find({ businessId: business._id.toString() }).sort({ createdAt: -1 }).lean()
  success(res, { business: idOf(business), listings: listings.map(idOf) })
})

/* ================================================================
   POST /api/businesses/me — create or update my business profile
   ================================================================ */
const upsertSchema = z.object({
  name: z.string().min(2),
  category: z.enum(BUSINESS_CATEGORIES as [BusinessCategory, ...BusinessCategory[]]),
  description: z.string().max(1000).optional(),
  phone: z.string().min(7),
  email: z.string().email().optional(),
  city: z.string().min(1),
  address: z.string().optional(),
})

router.post('/me', authenticate, requireRole('business'), async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const existing = await Business.findOne({ ownerId: req.user!.userId })
  if (existing) {
    Object.assign(existing, parsed.data)
    await existing.save()
    success(res, idOf(existing.toObject()))
    return
  }
  const business = await Business.create({ ...parsed.data, ownerId: req.user!.userId })
  success(res, idOf(business.toObject()), 'Business profile created', 201)
})

const inquiryStatusSchema = z.enum(['new', 'contacted', 'won', 'lost'])

router.get('/me/inquiries', authenticate, requireRole('business'), async (req, res) => {
  const business = await loadMyBusiness(req.user!.userId)
  if (!business) { success(res, { items: [] }); return }
  const status = req.query.status ? inquiryStatusSchema.safeParse(req.query.status) : null
  if (status && !status.success) { error(res, 'Invalid inquiry status'); return }
  const inquiries = await BusinessInquiry.find({
    businessId: business._id.toString(),
    ...(status?.success ? { status: status.data } : {}),
  }).sort({ createdAt: -1 }).lean()
  const listingIds = inquiries.flatMap((item) => item.listingId ? [item.listingId] : [])
  const listings = listingIds.length ? await BusinessListing.find({ _id: { $in: listingIds } }).select('title').lean() : []
  const titles = new Map(listings.map((item) => [item._id.toString(), item.title]))
  success(res, { items: inquiries.map((item) => ({ ...idOf(item), ...(item.listingId ? { listingTitle: titles.get(item.listingId) } : {}) })) })
})

router.patch('/me/inquiries/:id', authenticate, requireRole('business'), async (req, res) => {
  const parsed = z.object({ status: inquiryStatusSchema }).safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const business = await loadMyBusiness(req.user!.userId)
  if (!business) { error(res, 'Business profile not found', 404); return }
  const inquiry = await BusinessInquiry.findOneAndUpdate(
    { _id: param(req.params.id), businessId: business._id.toString() },
    { status: parsed.data.status },
    { new: true },
  ).lean()
  if (!inquiry) { error(res, 'Inquiry not found', 404); return }
  success(res, idOf(inquiry), 'Inquiry updated')
})

router.get('/me/analytics', authenticate, requireRole('business'), async (req, res) => {
  const business = await loadMyBusiness(req.user!.userId)
  if (!business) {
    success(res, { profileViews: 0, listingViews: 0, totalInquiries: 0, newInquiries: 0, wonInquiries: 0, conversionRate: 0, inquiriesByDay: [] })
    return
  }
  const businessId = business._id.toString()
  const [statusCounts, listingViews, inquiriesByDay] = await Promise.all([
    BusinessInquiry.aggregate<{ _id: string; count: number }>([
      { $match: { businessId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    BusinessListing.aggregate<{ total: number }>([
      { $match: { businessId } },
      { $group: { _id: null, total: { $sum: '$viewCount' } } },
    ]),
    BusinessInquiry.aggregate<{ _id: string; count: number }>([
      { $match: { businessId, createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ])
  const inquirySummary = summarizeInquiryStatuses(statusCounts)
  success(res, {
    profileViews: business.viewCount ?? 0,
    listingViews: listingViews[0]?.total ?? 0,
    ...inquirySummary,
    inquiriesByDay: inquiriesByDay.map((item) => ({ date: item._id, count: item.count })),
  })
})

/* ================================================================
   GET /api/businesses/:id — business detail + active listings
   (increments the public profile view counter)
   ================================================================ */
router.get('/:id', authenticate, async (req, res) => {
  const business = await Business.findByIdAndUpdate(param(req.params.id), { $inc: { viewCount: 1 } }, { new: true }).lean()
  if (!business) { error(res, 'Business not found', 404); return }
  await BusinessListing.updateMany({ businessId: business._id.toString(), isActive: true }, { $inc: { viewCount: 1 } })
  const listings = await BusinessListing.find({ businessId: business._id.toString(), isActive: true }).sort({ createdAt: -1 }).lean()
  success(res, { business: idOf(business), listings: listings.map(idOf) })
})

const inquirySchema = z.object({
  listingId: z.string().optional(),
  message: z.string().trim().max(1000).optional(),
})

router.post('/:id/inquiries', authenticate, async (req, res) => {
  const parsed = inquirySchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const business = await Business.findById(param(req.params.id)).lean()
  if (!business) { error(res, 'Business not found', 404); return }
  if (business.ownerId === req.user!.userId) { error(res, 'You cannot inquire with your own business'); return }
  if (parsed.data.listingId) {
    const listing = await BusinessListing.findOne({ _id: parsed.data.listingId, businessId: business._id.toString(), isActive: true }).lean()
    if (!listing) { error(res, 'Listing not found', 404); return }
  }
  const requester = await User.findById(req.user!.userId).select('firstName lastName phone email').lean()
  if (!requester) { error(res, 'User not found', 404); return }
  const inquiry = await BusinessInquiry.create({
    businessId: business._id.toString(),
    ...parsed.data,
    requesterId: req.user!.userId,
    requesterName: `${requester.firstName} ${requester.lastName}`.trim(),
    requesterPhone: requester.phone,
    requesterEmail: requester.email,
  })
  void notify({
    userId: business.ownerId,
    title: 'New business inquiry',
    message: `${requester.firstName} is interested in ${business.name}.`,
    actionUrl: '/dashboard',
  }).catch((err: unknown) => logger.warn('Business inquiry notification failed', { error: err instanceof Error ? err.message : String(err) }))
  success(res, idOf(inquiry.toObject()), 'Inquiry sent', 201)
})

router.get('/:id/reviews', authenticate, async (req, res) => {
  const businessId = param(req.params.id)
  const business = await Business.findById(businessId).select('_id').lean()
  if (!business) { error(res, 'Business not found', 404); return }
  const [reviews, eligibleInquiry] = await Promise.all([
    BusinessReview.find({ businessId }).sort({ createdAt: -1 }).lean(),
    BusinessInquiry.exists({ businessId, requesterId: req.user!.userId, status: 'won' }),
  ])
  success(res, { items: reviews.map(idOf), canReview: !!eligibleInquiry })
})

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  review: z.string().trim().max(1000).optional(),
})

router.post('/:id/reviews', authenticate, async (req, res) => {
  const businessId = param(req.params.id)
  const parsed = reviewSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const eligibleInquiry = await BusinessInquiry.exists({ businessId, requesterId: req.user!.userId, status: 'won' })
  if (!eligibleInquiry) { error(res, 'Only verified customers can review this business', 403); return }
  const author = await User.findById(req.user!.userId).select('firstName lastName').lean()
  if (!author) { error(res, 'User not found', 404); return }
  const saved = await BusinessReview.findOneAndUpdate(
    { businessId, authorId: req.user!.userId },
    { ...parsed.data, authorName: `${author.firstName} ${author.lastName}`.trim() },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean()
  const summary = await BusinessReview.aggregate<{ average: number; count: number }>([
    { $match: { businessId } },
    { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
  ])
  await Business.findByIdAndUpdate(businessId, {
    ratingAvg: Math.round((summary[0]?.average ?? 0) * 10) / 10,
    reviewCount: summary[0]?.count ?? 0,
  })
  success(res, idOf(saved), 'Review saved')
})

/* ================================================================
   Listings CRUD (owner only)
   ================================================================ */
const listingSchema = z.object({
  title: z.string().min(2),
  description: z.string().max(1000).optional(),
  type: z.enum(['product', 'service', 'discount']),
  price: z.number().min(0).optional(),
  promoText: z.string().max(200).optional(),
})

async function loadMyBusiness(userId: string) {
  return Business.findOne({ ownerId: userId })
}

router.post('/me/listings', authenticate, requireRole('business'), async (req, res) => {
  const parsed = listingSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const business = await loadMyBusiness(req.user!.userId)
  if (!business) { error(res, 'Create your business profile first', 400); return }

  const listing = await BusinessListing.create({ ...parsed.data, businessId: business._id.toString() })
  success(res, idOf(listing.toObject()), 'Listing created', 201)
})

router.patch('/me/listings/:id', authenticate, requireRole('business'), async (req, res) => {
  const parsed = listingSchema.partial().extend({ isActive: z.boolean() }).safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const business = await loadMyBusiness(req.user!.userId)
  const listing = await BusinessListing.findById(param(req.params.id))
  if (!business || !listing || listing.businessId !== business._id.toString()) { error(res, 'Listing not found', 404); return }

  Object.assign(listing, parsed.data)
  await listing.save()
  success(res, idOf(listing.toObject()), 'Listing updated')
})

router.delete('/me/listings/:id', authenticate, requireRole('business'), async (req, res) => {
  const business = await loadMyBusiness(req.user!.userId)
  const listing = await BusinessListing.findById(param(req.params.id))
  if (!business || !listing || listing.businessId !== business._id.toString()) { error(res, 'Listing not found', 404); return }

  await listing.deleteOne()
  success(res, null, 'Listing deleted')
})

export default router

import { Router } from 'express'
import { z } from 'zod'
import type { Types } from 'mongoose'
import { authenticate, requireRole } from '../middleware/auth.js'
import { Business, BUSINESS_CATEGORIES, type BusinessCategory } from '../models/Business.js'
import { BusinessListing } from '../models/BusinessListing.js'
import { success, error } from '../utils/response.js'
import { escapeRegex, param } from '../utils/params.js'

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

/* ================================================================
   GET /api/businesses/:id — business detail + active listings
   ================================================================ */
router.get('/:id', authenticate, async (req, res) => {
  const business = await Business.findById(param(req.params.id)).lean()
  if (!business) { error(res, 'Business not found', 404); return }
  const listings = await BusinessListing.find({ businessId: business._id.toString(), isActive: true }).sort({ createdAt: -1 }).lean()
  success(res, { business: idOf(business), listings: listings.map(idOf) })
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

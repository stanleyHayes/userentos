import { Router } from 'express'
import { Types } from 'mongoose'
import multer from 'multer'
import { z } from 'zod'
import { authenticate, optionalAuth, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { propertyController } from '../controllers/propertyController.js'
import { success, error } from '../utils/response.js'
import { Property } from '../models/Property.js'
import { embed, cosineSimilarity } from '../services/embeddings.js'
import { getSmartRecommendations } from '../services/recommendations.js'
import { cache } from '../services/cache.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

const router = Router()

/** Escape user input before interpolating into a Mongo $regex (ReDoS guard). */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

router.get('/', optionalAuth, asyncHandler(propertyController.list))
router.get('/favorites/me', authenticate, asyncHandler(propertyController.getFavoritesMe))
router.get('/recommendations/for-me', authenticate, asyncHandler(propertyController.recommendations))
// Moderation queue is admin-only — it lists every landlord's unpublished listings.
router.get('/pending-review', authenticate, requireRole('admin', 'super_admin'), asyncHandler(propertyController.pendingReview))
router.get('/:id/qualify', authenticate, asyncHandler(propertyController.qualify))
// NOTE: GET '/:id' is registered at the BOTTOM of this file so it does not shadow
// the literal GET routes (/recommendations/smart, /nearby) defined later.
router.post('/', authenticate, asyncHandler(propertyController.create))
router.post('/:id/publish', authenticate, asyncHandler(propertyController.publish))
// Approving/rejecting a listing is an admin moderation action.
router.post('/:id/review', authenticate, requireRole('admin', 'super_admin'), asyncHandler(propertyController.review))
router.patch('/:id', authenticate, asyncHandler(propertyController.update))
router.delete('/:id', authenticate, asyncHandler(propertyController.delete))
router.post('/:id/images', authenticate, upload.array('images', 10), asyncHandler(propertyController.uploadImages))
router.post('/:id/favorite', authenticate, asyncHandler(propertyController.toggleFavorite))

// ─── Semantic Search ───
router.post('/search/semantic', asyncHandler(async (req, res) => {
  const schema = z.object({
    query: z.string().min(1),
    city: z.string().optional(),
    region: z.string().optional(),
    type: z.string().optional(),
    minRent: z.number().optional(),
    maxRent: z.number().optional(),
    topK: z.number().int().min(1).max(50).default(10),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const { query, city, region, type, minRent, maxRent, topK } = parsed.data

  // Check cache
  const cacheKey = `semantic-search:${query}:${city ?? ''}:${region ?? ''}:${type ?? ''}:${minRent ?? ''}:${maxRent ?? ''}:${topK}`
  const cached = await cache.get<{ items: unknown[] }>(cacheKey)
  if (cached) {
    success(res, cached)
    return
  }

  // 1. Generate query embedding
  const { embedding: queryEmbedding } = await embed(query)

  // 2. Build MongoDB filter (hybrid: semantic + structured)
  const filter: Record<string, unknown> = { listingStatus: 'approved', isActive: { $ne: false } }
  if (city) filter['address.city'] = { $regex: escapeRegex(city), $options: 'i' }
  if (region) filter['address.region'] = { $regex: escapeRegex(region), $options: 'i' }
  if (type) filter.type = type
  if (minRent !== undefined || maxRent !== undefined) {
    const rentFilter: Record<string, number> = {}
    if (minRent !== undefined) rentFilter.$gte = minRent
    if (maxRent !== undefined) rentFilter.$lte = maxRent
    filter.rentAmount = rentFilter
  }

  // 3. Fetch candidates with embeddings
  const candidates = await Property.find(filter)
    .select('title description type rentAmount address bedrooms bathrooms furnished amenities images embedding')
    .limit(200)
    .lean()

  // 4. Rank by cosine similarity
  const scored = candidates
    .filter((c): c is typeof c & { embedding: number[] } => Array.isArray(c.embedding) && c.embedding.length > 0)
    .map((c) => ({
      ...c,
      id: (c._id as Types.ObjectId).toString(),
      similarity: cosineSimilarity(queryEmbedding, c.embedding),
    }))

  scored.sort((a, b) => b.similarity - a.similarity)
  const results = scored.slice(0, topK).map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    type: p.type,
    rentAmount: p.rentAmount,
    address: p.address,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    furnished: p.furnished,
    amenities: p.amenities,
    images: p.images,
    similarity: Math.round(p.similarity * 100) / 100,
  }))

  const response = { items: results, total: results.length, query }
  await cache.set(cacheKey, response, 300) // 5 minutes TTL
  success(res, response)
}))

// ─── Smart Recommendations (embedding-powered) ───
router.get('/recommendations/smart', authenticate, asyncHandler(async (req, res) => {
  const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 10))
  const recommendations = await getSmartRecommendations(req.user!.userId, limit)
  success(res, { items: recommendations, total: recommendations.length })
}))

// ─── Nearby properties (geospatial) ───
router.get('/nearby', asyncHandler(async (req, res) => {
  const schema = z.object({
    lat: z.coerce.number(),
    lng: z.coerce.number(),
    radiusKm: z.coerce.number().default(5),
    type: z.string().optional(),
    maxRent: z.coerce.number().optional(),
  })

  const parsed = schema.safeParse(req.query)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const { lat, lng, radiusKm, type, maxRent } = parsed.data

  // Simple bounding-box filter (good enough for Ghana-scale distances)
  // 1 degree lat ≈ 111km, 1 degree lng ≈ 111km * cos(lat)
  const latDelta = radiusKm / 111
  const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180))

  const filter: Record<string, unknown> = {
    listingStatus: 'approved',
    'coordinates.lat': { $gte: lat - latDelta, $lte: lat + latDelta },
    'coordinates.lng': { $gte: lng - lngDelta, $lte: lng + lngDelta },
  }
  if (type) filter.type = type
  if (maxRent) filter.rentAmount = { $lte: maxRent }

  const properties = await Property.find(filter)
    .select('title description type rentAmount address bedrooms bathrooms furnished amenities images coordinates')
    .limit(50)
    .lean()

  // Compute exact distances and sort
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const R = 6371 // Earth radius in km
  const scored = properties
    .filter((p) => p.coordinates?.lat != null && p.coordinates?.lng != null)
    .map((p) => {
      const dLat = toRad(p.coordinates!.lat - lat)
      const dLng = toRad(p.coordinates!.lng - lng)
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(p.coordinates!.lat)) * Math.sin(dLng / 2) ** 2
      const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      return { ...p, id: (p._id as Types.ObjectId).toString(), distance: Math.round(distance * 100) / 100 }
    })
    .filter((p) => p.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance)

  success(res, { items: scored, total: scored.length, center: { lat, lng }, radiusKm })
}))

// Registered last so the param route does not shadow the literal GET routes above.
router.get('/:id', optionalAuth, asyncHandler(propertyController.getById))

export default router

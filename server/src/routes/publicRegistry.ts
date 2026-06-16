import crypto from 'crypto'
import type { Types } from 'mongoose'
import { Router, type Request, type Response } from 'express'
import { Property } from '../models/Property.js'
import { RegistryPageView } from '../models/RegistryPageView.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireRole, requirePermission } from '../middleware/auth.js'

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex')
}

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim()
  }
  if (Array.isArray(fwd) && fwd.length > 0) {
    return fwd[0]
  }
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown'
}

// Escape special regex characters from untrusted user input before using it in $regex
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface SanitizedListing {
  id: string
  title: string
  city: string
  region: string
  digitalAddress: string
  neighborhood: string
  propertyType: string
  rentAmount: number
  bedrooms: number
  bathrooms: number
  listingStatus: 'approved'
  publishedAt: Date | null
  image: string | null
}

function sanitize(p: object): SanitizedListing {
  const raw = p as Record<string, unknown>
  const address = raw.address as Record<string, unknown> | undefined
  const images = Array.isArray(raw.images) ? raw.images : []
  return {
    id: ((raw._id as Types.ObjectId)?.toString?.() ?? raw.id) as string,
    title: (raw.title as string) ?? '',
    city: (address?.city as string) ?? '',
    region: (address?.region as string) ?? '',
    digitalAddress: (address?.digitalAddress as string) ?? '',
    neighborhood: (address?.neighborhood as string) ?? '',
    propertyType: (raw.type as string) ?? '',
    rentAmount: typeof raw.rentAmount === 'number' ? raw.rentAmount : 0,
    bedrooms: typeof raw.bedrooms === 'number' ? raw.bedrooms : 0,
    bathrooms: typeof raw.bathrooms === 'number' ? raw.bathrooms : 0,
    listingStatus: 'approved',
    publishedAt: (raw.publishedAt as Date | null | undefined) ?? null,
    image: images.length > 0 ? String(images[0]) : null,
  }
}

const router = Router()

router.get(
  '/search',
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query

    const queryString = typeof q.query === 'string' ? q.query.trim() : ''
    const city = typeof q.city === 'string' ? q.city.trim() : ''
    const region = typeof q.region === 'string' ? q.region.trim() : ''
    const propertyType = typeof q.propertyType === 'string' ? q.propertyType.trim() : ''
    const minRent = q.minRent ? Number(q.minRent) : undefined
    const maxRent = q.maxRent ? Number(q.maxRent) : undefined

    const page = Math.max(1, Number(q.page) || 1)
    const pageSize = Math.min(50, Math.max(1, Number(q.pageSize) || 20))

    const filter: Record<string, unknown> = {
      listingStatus: 'approved',
    }

    if (city) {
      filter['address.city'] = { $regex: escapeRegex(city), $options: 'i' }
    }
    if (region) {
      filter['address.region'] = { $regex: escapeRegex(region), $options: 'i' }
    }
    if (propertyType) {
      filter.type = propertyType
    }
    if (minRent !== undefined && !Number.isNaN(minRent)) {
      filter.rentAmount = { ...(filter.rentAmount ?? {}), $gte: minRent }
    }
    if (maxRent !== undefined && !Number.isNaN(maxRent)) {
      filter.rentAmount = { ...(filter.rentAmount ?? {}), $lte: maxRent }
    }

    if (queryString) {
      const escaped = escapeRegex(queryString)
      filter.$or = [
        { title: { $regex: escaped, $options: 'i' } },
        { 'address.city': { $regex: escaped, $options: 'i' } },
        { 'address.region': { $regex: escaped, $options: 'i' } },
        { 'address.digitalAddress': { $regex: escaped, $options: 'i' } },
        { 'address.neighborhood': { $regex: escaped, $options: 'i' } },
      ]
    }

    const total = await Property.countDocuments(filter)
    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    const docs = await Property.find(filter)
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean()

    const items = docs.map(sanitize)

    success(res, { items, total, page, pageSize, totalPages })
  }),
)

// ─── Pageview tracking (no auth) ───
router.post(
  '/track',
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body ?? {}
    const path = typeof body.path === 'string' ? body.path.trim().slice(0, 256) : ''
    if (!path) {
      error(res, 'path is required', 400)
      return
    }

    const propertyId = typeof body.propertyId === 'string' && /^[a-f0-9]{24}$/i.test(body.propertyId)
      ? body.propertyId
      : undefined
    const referrer = typeof body.referrer === 'string' ? body.referrer.slice(0, 512) : undefined
    const userAgent = typeof req.headers['user-agent'] === 'string'
      ? (req.headers['user-agent'] as string).slice(0, 512)
      : undefined

    const ipHash = hashIp(clientIp(req))

    try {
      await RegistryPageView.create({ path, propertyId, referrer, userAgent, ipHash })
    } catch (err) {
      // Best-effort tracking — never block client
      console.warn('[registry/track] write failed:', (err as Error).message)
    }

    success(res, { ok: true })
  }),
)

// ─── Aggregate stats (admin / super_admin) ───
router.get(
  '/stats',
  authenticate,
  requireRole('admin', 'super_admin'),
  requirePermission('analytics:view'),
  asyncHandler(async (_req: Request, res: Response) => {
    const now = new Date()
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const [totalViews, uniqueViewersAgg, topPropsAgg, dailyTrendAgg] = await Promise.all([
      RegistryPageView.countDocuments({ createdAt: { $gte: start } }),
      RegistryPageView.aggregate([
        { $match: { createdAt: { $gte: start } } },
        { $group: { _id: '$ipHash' } },
        { $count: 'count' },
      ]),
      RegistryPageView.aggregate([
        { $match: { createdAt: { $gte: start }, propertyId: { $ne: null, $exists: true } } },
        { $group: { _id: '$propertyId', views: { $sum: 1 } } },
        { $sort: { views: -1 } },
        { $limit: 10 },
      ]),
      RegistryPageView.aggregate([
        { $match: { createdAt: { $gte: start } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            views: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ])

    const uniqueViewers = uniqueViewersAgg[0]?.count ?? 0

    // Hydrate property titles
    const propIds = topPropsAgg.map((row) => row._id).filter((id): id is string => typeof id === 'string')
    const props = propIds.length
      ? await Property.find({ _id: { $in: propIds } }).select('title').lean()
      : []
    const titleById = new Map<string, string>()
    for (const p of props) {
      titleById.set((p._id as Types.ObjectId).toString(), p.title ?? 'Untitled')
    }

    const topProperties = topPropsAgg.map((row) => ({
      propertyId: row._id as string,
      title: titleById.get(row._id as string) ?? 'Removed property',
      views: row.views as number,
    }))

    // Pad daily trend so we always return 30 entries
    const trendByDate = new Map<string, number>()
    for (const row of dailyTrendAgg) {
      trendByDate.set(row._id as string, row.views as number)
    }
    const dailyTrend: { date: string; views: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const key = d.toISOString().slice(0, 10)
      dailyTrend.push({ date: key, views: trendByDate.get(key) ?? 0 })
    }

    success(res, { totalViews, uniqueViewers, topProperties, dailyTrend })
  }),
)

router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = param(req.params.id)

    if (!id || !/^[a-f0-9]{24}$/i.test(id)) {
      error(res, 'Property not found', 404)
      return
    }

    const doc = await Property.findOne({ _id: id, listingStatus: 'approved' }).lean()
    if (!doc) {
      error(res, 'Property not found', 404)
      return
    }

    success(res, sanitize(doc))
  }),
)

export default router

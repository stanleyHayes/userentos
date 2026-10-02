import type { Types } from 'mongoose'
import { Router, type Request, type Response } from 'express'
import { Property } from '../models/Property.js'
import { User } from '../models/User.js'
import { RegistryPageView } from '../models/RegistryPageView.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, optionalAuth, requireRole, requirePermission } from '../middleware/auth.js'
import { PUBLICLY_VISIBLE_STATUSES } from '../services/propertyReview.js'
import { visitorHash } from '../utils/visitorHash.js'
import { closedAccountIds, isClosedAccount } from '../services/closedAccounts.js'
import { LISTING_TYPES, RENTAL_LISTINGS, isRentalListing, listingUrl, normalizeListingRef, whatsappEnquiryText, whatsappLink } from '../services/listings.js'
import { listingSeo } from '../services/seo.js'
import { listingContact } from '../services/listingContact.js'
import { agentForProperty, recordEnquiry } from '../services/leads.js'
import { StorefrontEvent } from '../models/StorefrontEvent.js'
import { whatsappLimiter } from '../middleware/rateLimit.js'

// Keyed and rotated daily (utils/visitorHash.ts): an unsalted SHA-256 of an
// IPv4 address can be reversed by hashing all 2^32 of them.
function hashIp(ip: string): string {
  return visitorHash(`ip:${ip}`)
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
  /** Short reference; the shareable page is /property/<ref>. Null only until backfilled. */
  ref: string | null
  /** rent | sale | short_let — rentAmount is the asking price for that purpose. */
  listingType: string
  title: string
  city: string
  region: string
  digitalAddress: string
  neighborhood: string
  propertyType: string
  rentAmount: number
  bedrooms: number
  bathrooms: number
  listingStatus: string
  publishedAt: Date | null
  image: string | null
}

function sanitize(p: object): SanitizedListing {
  const raw = p as Record<string, unknown>
  const address = raw.address as Record<string, unknown> | undefined
  const images = Array.isArray(raw.images) ? raw.images : []
  return {
    id: ((raw._id as Types.ObjectId)?.toString?.() ?? raw.id) as string,
    ref: typeof raw.listingRef === 'string' ? raw.listingRef : null,
    listingType: typeof raw.listingType === 'string' ? raw.listingType : 'rent',
    title: (raw.title as string) ?? '',
    city: (address?.city as string) ?? '',
    region: (address?.region as string) ?? '',
    digitalAddress: (address?.digitalAddress as string) ?? '',
    neighborhood: (address?.neighborhood as string) ?? '',
    propertyType: (raw.type as string) ?? '',
    rentAmount: typeof raw.rentAmount === 'number' ? raw.rentAmount : 0,
    bedrooms: typeof raw.bedrooms === 'number' ? raw.bedrooms : 0,
    bathrooms: typeof raw.bathrooms === 'number' ? raw.bathrooms : 0,
    // The real status, not a hard-coded 'approved' — 'published' is equally
    // live and the response should say which one it is.
    listingStatus: (raw.listingStatus as string) ?? 'approved',
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
    const listingType = typeof q.listingType === 'string' && (LISTING_TYPES as readonly string[]).includes(q.listingType) ? q.listingType : ''
    const minRent = q.minRent ? Number(q.minRent) : undefined
    const maxRent = q.maxRent ? Number(q.maxRent) : undefined

    const page = Math.max(1, Number(q.page) || 1)
    const pageSize = Math.min(50, Math.max(1, Number(q.pageSize) || 20))

    const filter: Record<string, unknown> = {
      listingStatus: { $in: PUBLICLY_VISIBLE_STATUSES },
      landlordId: { $nin: await closedAccountIds() },
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
    // "rent" also covers listings created before listing types existed.
    if (listingType === 'rent') Object.assign(filter, RENTAL_LISTINGS)
    else if (listingType) filter.listingType = listingType
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
      // _id last: publishedAt and createdAt can both tie for listings
      // approved in the same batch, and without a total order paging the
      // public registry can repeat one property and skip another.
      .sort({ publishedAt: -1, createdAt: -1, _id: -1 })
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

/** A publicly visible listing by its short reference or its id; null otherwise. */
async function findPublicListing(key: string) {
  const ref = normalizeListingRef(key)
  const match = /^[a-f0-9]{24}$/i.test(key) ? { _id: key } : ref ? { listingRef: ref } : null
  if (!match) return null
  const doc = await Property.findOne({ ...match, listingStatus: { $in: PUBLICLY_VISIBLE_STATUSES } }).lean()
  if (!doc || await isClosedAccount(doc.landlordId)) return null
  return doc
}

const locationOf = (doc: { address?: { neighborhood?: string; city?: string } }) =>
  [doc.address?.neighborhood, doc.address?.city].filter(Boolean).join(', ')

// The shareable property page (brief §04): everything a visitor needs to decide
// and to get in touch. The street address, coordinates and the owner's phone
// number stay off it; WhatsApp goes through POST /:id/whatsapp below.
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await findPublicListing(param(req.params.id))
    if (!doc) {
      error(res, 'Property not found', 404)
      return
    }

    const resolved = await agentForProperty(String(doc._id))
    // The only landlord trust signal the public page may show: whether our
    // team approved the identity-verification request. Not isVerified —
    // admin-created and invited accounts get that without any document
    // review. Ownership is never checked, so it is never claimed.
    const [owner, contact] = await Promise.all([
      User.findById(doc.landlordId).select('verificationStatus').lean(),
      resolved?.agentId ? listingContact(resolved.agentId) : null,
    ])
    const rental = isRentalListing(doc.listingType)
    // The title, description and structured data the server renders for this page (services/seo.ts), for the app to keep.
    const seo = listingSeo(doc)
    success(res, {
      ...sanitize(doc),
      url: doc.listingRef ? listingUrl(doc.listingRef) : null,
      // The address search engines index it at: /property/<description>-<ref>.
      canonicalUrl: seo.canonical,
      seo: { title: seo.title, description: seo.description, jsonLd: seo.jsonLd },
      description: doc.description ?? '',
      images: Array.isArray(doc.images) ? doc.images : [],
      amenities: doc.amenities ?? [],
      rules: doc.rules ?? [],
      status: doc.status,
      furnished: Boolean(doc.furnished),
      floorArea: doc.floorArea ?? null,
      parkingSpaces: doc.parkingSpaces ?? 0,
      availableFrom: doc.availableFrom ?? null,
      ...(rental ? { rentDurationMonths: doc.rentDurationMonths, advanceMonths: doc.advanceMonths } : {}),
      landlordIdentityVerified: owner?.verificationStatus === 'verified',
      agent: contact?.agent ?? null,
    })
  }),
)

/**
 * WhatsApp enquiry (brief §05). Answers the wa.me link for the agent who
 * handles the listing, with the property already in the message, and lets
 * the agent know: a signed-in enquirer becomes a lead (with an SMS and in-app
 * alert); an anonymous tap counts as a contact click on the agent's website
 * analytics — the agent sees who it is on WhatsApp itself.
 */
router.post(
  '/:id/whatsapp',
  whatsappLimiter,
  optionalAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await findPublicListing(param(req.params.id))
    const resolved = doc ? await agentForProperty(String(doc._id)) : null
    if (!doc || !resolved?.agentId) {
      error(res, 'Property not found', 404)
      return
    }
    const contact = await listingContact(resolved.agentId)
    // Off unless an admin switches direct WhatsApp on (listingContact.ts).
    if (!contact?.whatsappNumber) {
      error(res, 'Send the agent a message on RentOS instead — enquiries and replies stay on RentOS, where you are protected.', 409)
      return
    }

    const url = doc.listingRef ? listingUrl(doc.listingRef) : `${listingUrl(String(doc._id))}`
    const text = whatsappEnquiryText({ title: doc.title, location: locationOf(doc), ref: doc.listingRef ?? null, url })
    const propertyId = String(doc._id)

    if (req.user && req.user.userId !== resolved.agentId) {
      const requester = await User.findById(req.user.userId).select('firstName lastName').lean()
      if (requester) {
        await recordEnquiry({
          propertyId,
          propertyTitle: doc.title,
          agentId: resolved.agentId,
          requesterId: req.user.userId,
          contact: { name: `${requester.firstName} ${requester.lastName}`.trim() },
          channel: 'whatsapp',
        }).catch((err) => console.warn('[registry/whatsapp] lead not recorded:', (err as Error).message))
      }
    }
    if (contact.agent.storefrontSlug && req.user?.userId !== resolved.agentId) {
      StorefrontEvent.create({
        storefrontSlug: contact.agent.storefrontSlug,
        type: 'contact_click',
        channel: 'whatsapp',
        propertyId,
        visitorHash: req.user ? visitorHash(`user:${req.user.userId}`) : hashIp(clientIp(req)),
      }).catch((err) => console.warn('[registry/whatsapp] click not recorded:', (err as Error).message))
    }

    success(res, { url: whatsappLink(contact.whatsappNumber, text) })
  }),
)

export default router

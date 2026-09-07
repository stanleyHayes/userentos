/**
 * Storefront API (spec §4, §13).
 *
 * Entitlements gate every premium action server-side: creating a storefront
 * needs `storefront.enabled`, branding needs `storefront.custom_branding`,
 * attaching a domain needs `storefront.custom_domain`, and the traffic report
 * needs `storefront.analytics`. The acceptance matrix requires that a seller
 * without the plan "cannot bypass the API", so none of these checks live in
 * the UI.
 */
import crypto from 'crypto'
import { Router, type Request } from 'express'
import { z } from 'zod'
import type { Types } from 'mongoose'
import { authenticate, optionalAuth, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { publicLimiter } from '../middleware/rateLimit.js'
import { Storefront } from '../models/Storefront.js'
import { StorefrontDomain } from '../models/StorefrontDomain.js'
import { StorefrontEvent } from '../models/StorefrontEvent.js'
import { Property } from '../models/Property.js'
import { BlogPost } from '../models/BlogPost.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { recordAudit } from '../utils/audit.js'
import { requireEntitlement, getFeature, EntitlementError } from '../services/entitlements.js'
import {
  validateSlug, validateDomain, newVerificationToken, checkDomainOwnership,
  publicStorefrontScope, storefrontScope,
} from '../services/storefront.js'

const router = Router()

/** Map an entitlement failure to 402 — "your plan does not include this". */
function handleEntitlement(err: unknown, res: Parameters<typeof error>[0]): boolean {
  if (err instanceof EntitlementError) {
    error(res, err.message, 402)
    return true
  }
  return false
}

const createSchema = z.object({
  slug: z.string().min(3).max(40),
  name: z.string().min(2).max(80),
  tagline: z.string().max(160).optional(),
  about: z.string().max(4000).optional(),
  contact: z.object({
    phone: z.string().max(20).optional(),
    email: z.string().email().optional(),
    whatsapp: z.string().max(20).optional(),
    city: z.string().max(60).optional(),
  }).optional(),
})

/** Slug availability, for the setup form. */
router.get('/slug-available/:slug', authenticate, asyncHandler(async (req, res) => {
  const slug = param(req.params.slug).toLowerCase()
  const valid = validateSlug(slug)
  if (!valid.ok) { success(res, { available: false, reason: valid.reason }); return }

  const taken = await Storefront.findOne({ slug }).lean()
  success(res, { available: !taken, reason: taken ? 'That address is already taken.' : undefined })
}))

/** The signed-in seller's storefront. */
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const storefront = await Storefront.findOne({ ownerId: req.user!.userId }).lean()
  if (!storefront) { success(res, null); return }

  const domains = await StorefrontDomain.find({ storefrontId: String(storefront._id), status: { $ne: 'removed' } }).lean()
  success(res, {
    ...storefront,
    id: String(storefront._id),
    domains: domains.map((d) => ({ ...d, id: String(d._id) })),
  })
}))

router.post('/', authenticate, asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  try {
    await requireEntitlement(req.user!.userId, 'storefront.enabled', 'A storefront')
  } catch (err) {
    if (handleEntitlement(err, res)) return
    throw err
  }

  const slug = parsed.data.slug.toLowerCase()
  const valid = validateSlug(slug)
  if (!valid.ok) { error(res, valid.reason); return }

  const [existingForOwner, slugTaken] = await Promise.all([
    Storefront.findOne({ ownerId: req.user!.userId }).lean(),
    Storefront.findOne({ slug }).lean(),
  ])
  if (existingForOwner) { error(res, 'You already have a storefront', 409); return }
  if (slugTaken) { error(res, 'That storefront address is already taken', 409); return }

  const storefront = await Storefront.create({
    ...parsed.data,
    slug,
    ownerType: 'user',
    ownerId: req.user!.userId,
    status: 'active',
  })

  await recordAudit(req, 'storefront.created', 'Storefront', String(storefront._id), { slug })
  success(res, { ...storefront.toObject(), id: String(storefront._id) }, 'Storefront created', 201)
}))

const updateSchema = createSchema.partial().omit({ slug: true }).extend({
  branding: z.object({
    logoUrl: z.string().url().optional(),
    coverUrl: z.string().url().optional(),
    primaryColor: z.string().max(20).optional(),
    accentColor: z.string().max(20).optional(),
    theme: z.string().max(40).optional(),
    hideRentosBranding: z.boolean().optional(),
  }).optional(),
})

router.patch('/me', authenticate, asyncHandler(async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const storefront = await Storefront.findOne({ ownerId: req.user!.userId })
  if (!storefront) { error(res, 'Create your storefront first', 404); return }

  // Branding is a separate entitlement from having a storefront at all.
  if (parsed.data.branding) {
    try {
      await requireEntitlement(req.user!.userId, 'storefront.custom_branding', 'Custom branding')
    } catch (err) {
      if (handleEntitlement(err, res)) return
      throw err
    }
    if (parsed.data.branding.hideRentosBranding) {
      try {
        await requireEntitlement(req.user!.userId, 'storefront.remove_rentos_branding', 'Removing RentOS branding')
      } catch (err) {
        if (handleEntitlement(err, res)) return
        throw err
      }
    }
    storefront.branding = { ...storefront.branding, ...parsed.data.branding }
  }

  if (parsed.data.name) storefront.name = parsed.data.name
  if (parsed.data.tagline !== undefined) storefront.tagline = parsed.data.tagline
  if (parsed.data.about !== undefined) storefront.about = parsed.data.about
  if (parsed.data.contact) storefront.contact = { ...storefront.contact, ...parsed.data.contact }
  await storefront.save()

  await recordAudit(req, 'storefront.updated', 'Storefront', String(storefront._id), { fields: Object.keys(parsed.data) })
  success(res, { ...storefront.toObject(), id: String(storefront._id) }, 'Storefront updated')
}))

// ─── Custom domains (§4.3) ───

router.post('/me/domains', authenticate, asyncHandler(async (req, res) => {
  const schema = z.object({ domain: z.string().min(4).max(253) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  try {
    await requireEntitlement(req.user!.userId, 'storefront.custom_domain', 'A custom domain')
  } catch (err) {
    if (handleEntitlement(err, res)) return
    throw err
  }

  const storefront = await Storefront.findOne({ ownerId: req.user!.userId })
  if (!storefront) { error(res, 'Create your storefront first', 404); return }

  const domain = parsed.data.domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  const valid = validateDomain(domain)
  if (!valid.ok) { error(res, valid.reason); return }

  const taken = await StorefrontDomain.findOne({ domain, status: { $ne: 'removed' } }).lean()
  if (taken) { error(res, 'That domain is already connected to a storefront', 409); return }

  const record = await StorefrontDomain.create({
    storefrontId: String(storefront._id),
    domain,
    verificationToken: newVerificationToken(),
    status: 'pending',
  })

  await recordAudit(req, 'storefront.domain_added', 'StorefrontDomain', String(record._id), { domain })

  success(res, {
    ...record.toObject(),
    id: String(record._id),
    instructions: {
      txt: { host: '@', type: 'TXT', value: record.verificationToken },
      cname: { host: 'www', type: 'CNAME', value: 'storefronts.userentos.com' },
    },
  }, 'Domain added — publish the DNS records, then verify', 201)
}))

/** Run the ownership check now. */
router.post('/me/domains/:id/verify', authenticate, asyncHandler(async (req, res) => {
  const storefront = await Storefront.findOne({ ownerId: req.user!.userId }).lean()
  if (!storefront) { error(res, 'Create your storefront first', 404); return }

  const record = await StorefrontDomain.findOne({ _id: param(req.params.id), storefrontId: String(storefront._id) })
  if (!record) { error(res, 'Domain not found', 404); return }

  const result = await checkDomainOwnership(record.domain, record.verificationToken)
  record.lastCheckedAt = new Date()

  if (!result.verified) {
    record.status = 'pending'
    record.failureReason = result.reason
    await record.save()
    error(res, result.reason ?? 'Verification failed', 409)
    return
  }

  record.status = 'verified'
  record.verifiedAt = new Date()
  record.failureReason = undefined
  // TLS is provisioned by the hosting layer; surface the wait rather than
  // claiming the domain is live before a certificate exists.
  record.tlsStatus = 'provisioning'
  await record.save()

  await recordAudit(req, 'storefront.domain_verified', 'StorefrontDomain', String(record._id), { domain: record.domain })
  success(res, { ...record.toObject(), id: String(record._id) }, 'Domain verified — TLS is being provisioned')
}))

/**
 * Promote a domain to canonical.
 *
 * Refused unless verified: the acceptance matrix requires that an unverified
 * domain can never become canonical.
 */
router.post('/me/domains/:id/canonical', authenticate, asyncHandler(async (req, res) => {
  const storefront = await Storefront.findOne({ ownerId: req.user!.userId })
  if (!storefront) { error(res, 'Create your storefront first', 404); return }

  const record = await StorefrontDomain.findOne({ _id: param(req.params.id), storefrontId: String(storefront._id) })
  if (!record) { error(res, 'Domain not found', 404); return }
  if (record.status !== 'verified' && record.status !== 'active') {
    error(res, 'Verify the domain before making it canonical', 409)
    return
  }

  record.status = 'active'
  await record.save()
  const previous = storefront.canonicalDomain
  storefront.canonicalDomain = record.domain
  await storefront.save()

  await recordAudit(req, 'storefront.canonical_changed', 'Storefront', String(storefront._id), { from: previous, to: record.domain })
  success(res, { canonicalDomain: record.domain }, 'Canonical domain updated')
}))

/** Remove a domain; the storefront falls back to its userentos.com subdomain. */
router.delete('/me/domains/:id', authenticate, asyncHandler(async (req, res) => {
  const storefront = await Storefront.findOne({ ownerId: req.user!.userId })
  if (!storefront) { error(res, 'Create your storefront first', 404); return }

  const record = await StorefrontDomain.findOne({ _id: param(req.params.id), storefrontId: String(storefront._id) })
  if (!record) { error(res, 'Domain not found', 404); return }

  record.status = 'removed'
  await record.save()
  if (storefront.canonicalDomain === record.domain) {
    storefront.canonicalDomain = undefined
    await storefront.save()
  }

  await recordAudit(req, 'storefront.domain_removed', 'StorefrontDomain', String(record._id), { domain: record.domain })
  success(res, null, `Removed — your storefront is back on ${storefront.slug}.userentos.com`)
}))

// ─── Analytics (§4.4) ───

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_ANALYTICS_DAYS = 30
/** 90 days keeps the aggregation bounded and the previous-window lookback at 180. */
const MAX_ANALYTICS_DAYS = 90

/** Midnight UTC. Ghana runs on UTC, so a UTC day is the seller's own day. */
function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

/**
 * `?days=` to a whole number of days inside the supported range.
 *
 * Exported for the unit tests: this and the three helpers below are the parts
 * worth pinning down, and they are pure precisely so they can be.
 */
export function clampAnalyticsDays(raw: unknown): number {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string' && typeof value !== 'number') return DEFAULT_ANALYTICS_DAYS
  const parsed = Number(typeof value === 'string' ? value.trim() : value)
  // Junk and nonsense fall back to the default rather than erroring — a bad
  // query string should not take the dashboard down.
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_ANALYTICS_DAYS
  return Math.min(MAX_ANALYTICS_DAYS, Math.max(1, Math.floor(parsed)))
}

export interface AnalyticsWindow {
  days: number
  from: Date
  to: Date
  /** Start of the equal-length window immediately before `from`. */
  previousFrom: Date
}

export function analyticsWindow(days: number, now: Date = new Date()): AnalyticsWindow {
  // `days` counts calendar days INCLUDING today, so a 30-day range starts 29
  // days back at midnight. Starting exactly 30×24h back instead would make the
  // first bucket a part-day, which draws as a dip that never happened.
  const from = new Date(startOfUtcDay(now).getTime() - (days - 1) * DAY_MS)
  return { days, from, to: now, previousFrom: new Date(from.getTime() - days * DAY_MS) }
}

/**
 * Change against the previous window, as a percentage to one decimal place.
 *
 * Null when there is no baseline to divide by: 0 → 12 is not "+100%", and
 * printing a number there would be inventing one. Callers render null as
 * "no comparison yet".
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export interface EventTypeCount { type: string; count: number }

export interface EventTotals {
  views: number
  listingImpressions: number
  contactClicks: number
}

/** Fold `$group`-by-type rows into the three headline counters. */
export function countsByType(rows: EventTypeCount[]): EventTotals {
  const totals: EventTotals = { views: 0, listingImpressions: 0, contactClicks: 0 }
  for (const row of rows) {
    if (row.type === 'view') totals.views += row.count
    else if (row.type === 'listing_impression') totals.listingImpressions += row.count
    else if (row.type === 'contact_click') totals.contactClicks += row.count
  }
  return totals
}

export interface DailyTypeRow extends EventTypeCount { date: string }
export interface DailyVisitorRow { date: string; visitors: number }
export interface DailyBucket extends EventTotals {
  date: string
  uniqueVisitors: number
}

/**
 * One bucket per day in the range, zero-filled and in date order.
 *
 * Mongo only returns the days that had events. Handing a sparse series to a
 * chart closes the gaps up, so a storefront with traffic on two days out of
 * thirty draws as a storefront with traffic every day.
 */
export function buildDailySeries(
  from: Date,
  days: number,
  typeRows: DailyTypeRow[],
  visitorRows: DailyVisitorRow[],
): DailyBucket[] {
  const buckets = new Map<string, DailyBucket>()
  const start = startOfUtcDay(from).getTime()
  for (let i = 0; i < days; i++) {
    const date = new Date(start + i * DAY_MS).toISOString().slice(0, 10)
    buckets.set(date, { date, views: 0, uniqueVisitors: 0, listingImpressions: 0, contactClicks: 0 })
  }

  for (const row of typeRows) {
    const bucket = buckets.get(row.date)
    // A row outside the range (clock skew on a write) is dropped rather than
    // folded into a neighbouring day, which would misattribute real traffic.
    if (!bucket) continue
    const counted = countsByType([row])
    bucket.views += counted.views
    bucket.listingImpressions += counted.listingImpressions
    bucket.contactClicks += counted.contactClicks
  }

  for (const row of visitorRows) {
    const bucket = buckets.get(row.date)
    if (bucket) bucket.uniqueVisitors = row.visitors
  }

  return [...buckets.values()]
}

/**
 * The seller's own traffic report.
 *
 * Gated on `storefront.analytics`, which is a TIERED string feature
 * ('none' | 'basic' | 'advanced') rather than a boolean, so `requireEntitlement`
 * cannot express it — its check is `value === true`, which 'basic' would fail.
 * The read below fails closed (anything that is not a recognised tier is
 * refused) and produces the same EntitlementError → 402 as every boolean gate
 * in this file. The tier itself is echoed back so the UI can name the plan;
 * basic and advanced serve the same payload today because nothing in the spec
 * defines the split, and inventing a paywall is worse than not having one.
 */
router.get('/me/analytics', authenticate, asyncHandler(async (req, res) => {
  const tier = await getFeature(req.user!.userId, 'storefront.analytics')
  if (typeof tier !== 'string' || tier === '' || tier === 'none') {
    handleEntitlement(
      new EntitlementError('storefront.analytics', 'Storefront analytics is not included in your plan.'),
      res,
    )
    return
  }

  const storefront = await Storefront.findOne({ ownerId: req.user!.userId }).lean()
  if (!storefront) { error(res, 'Create your storefront first', 404); return }

  const days = clampAnalyticsDays(req.query.days)
  const { from, to, previousFrom } = analyticsWindow(days)
  const current = { storefrontSlug: storefront.slug, createdAt: { $gte: from, $lte: to } }
  const previous = { storefrontSlug: storefront.slug, createdAt: { $gte: previousFrom, $lt: from } }
  const dayKey = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } }

  const [dailyRows, previousRows, visitorDailyRows, uniqueNow, uniqueBefore, channelRows, topRows] = await Promise.all([
    // Daily counts double as the current-window totals, so the series and the
    // headline can never disagree with each other.
    StorefrontEvent.aggregate([
      { $match: current },
      { $group: { _id: { date: dayKey, type: '$type' }, count: { $sum: 1 } } },
    ]),
    StorefrontEvent.aggregate([
      { $match: previous },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]),
    StorefrontEvent.aggregate([
      { $match: { ...current, type: 'view' } },
      { $group: { _id: { date: dayKey, visitor: '$visitorHash' } } },
      { $group: { _id: '$_id.date', visitors: { $sum: 1 } } },
    ]),
    // Window uniques are counted separately, not summed from the daily rows —
    // a visitor who comes back on Tuesday is one visitor, not two.
    StorefrontEvent.aggregate([
      { $match: { ...current, type: 'view' } },
      { $group: { _id: '$visitorHash' } },
      { $count: 'count' },
    ]),
    StorefrontEvent.aggregate([
      { $match: { ...previous, type: 'view' } },
      { $group: { _id: '$visitorHash' } },
      { $count: 'count' },
    ]),
    StorefrontEvent.aggregate([
      { $match: { ...current, type: 'contact_click' } },
      { $group: { _id: '$channel', count: { $sum: 1 } } },
    ]),
    StorefrontEvent.aggregate([
      { $match: { ...current, type: 'view', propertyId: { $exists: true, $ne: null } } },
      { $group: { _id: '$propertyId', views: { $sum: 1 } } },
      { $sort: { views: -1 } },
      { $limit: 10 },
    ]),
  ])

  const typeRows: DailyTypeRow[] = (dailyRows as { _id: { date: string; type: string }; count: number }[])
    .map((row) => ({ date: row._id.date, type: row._id.type, count: row.count }))
  const visitorRows: DailyVisitorRow[] = (visitorDailyRows as { _id: string; visitors: number }[])
    .map((row) => ({ date: row._id, visitors: row.visitors }))

  const totals = countsByType(typeRows)
  const previousTotals = countsByType(
    (previousRows as { _id: string; count: number }[]).map((row) => ({ type: row._id, count: row.count })),
  )
  const uniqueVisitors = (uniqueNow as { count: number }[])[0]?.count ?? 0
  const previousUniqueVisitors = (uniqueBefore as { count: number }[])[0]?.count ?? 0

  const channels = { phone: 0, email: 0, whatsapp: 0 }
  for (const row of channelRows as { _id: string | null; count: number }[]) {
    if (row._id === 'phone' || row._id === 'email' || row._id === 'whatsapp') channels[row._id] = row.count
  }

  // Titles are read through the tenant scope. /:slug/track is unauthenticated,
  // so a forged propertyId must never pull another seller's listing title into
  // this response — an id that does not resolve inside the scope is dropped.
  const ranked = topRows as { _id: string; views: number }[]
  const listings = ranked.length
    ? await Property.find(
      storefrontScope(storefront, { _id: { $in: ranked.map((row) => row._id) } }) as Record<string, unknown>,
    ).select('title').lean()
    : []
  const titleById = new Map(
    (listings as unknown as { _id: Types.ObjectId; title?: string }[])
      .map((p) => [p._id.toString(), p.title ?? 'Untitled listing'] as const),
  )
  const topListings = ranked.flatMap((row) => {
    const title = titleById.get(row._id)
    return title ? [{ propertyId: row._id, title, views: row.views }] : []
  })

  const metric = (value: number, before: number) => ({
    value,
    previous: before,
    changePercent: percentChange(value, before),
  })

  success(res, {
    tier,
    range: {
      days,
      from: from.toISOString(),
      to: to.toISOString(),
      previousFrom: previousFrom.toISOString(),
    },
    headline: {
      views: metric(totals.views, previousTotals.views),
      uniqueVisitors: metric(uniqueVisitors, previousUniqueVisitors),
      listingImpressions: metric(totals.listingImpressions, previousTotals.listingImpressions),
      contactClicks: metric(totals.contactClicks, previousTotals.contactClicks),
    },
    contactChannels: channels,
    daily: buildDailySeries(from, days, typeRows, visitorRows),
    topListings,
  })
}))

// ─── Public storefront (tenant-scoped reads) ───

/**
 * Which storefront does this request's host belong to?
 *
 * Returns null for the platform's own hostnames, so the web app can call this
 * unconditionally on boot and render either the storefront or the normal app.
 */
router.get('/resolve/host', asyncHandler(async (req, res) => {
  const slug = req.storefrontSlug
  if (!slug) { success(res, null); return }

  const storefront = await Storefront.findOne({ slug, status: 'active' }).lean()
  if (!storefront) { success(res, null); return }

  success(res, {
    slug: storefront.slug,
    name: storefront.name,
    canonicalUrl: storefront.canonicalDomain
      ? `https://${storefront.canonicalDomain}`
      : `https://${storefront.slug}.userentos.com`,
  })
}))


const trackSchema = z.object({
  type: z.enum(['view', 'listing_impression', 'contact_click']),
  propertyId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  channel: z.enum(['phone', 'email', 'whatsapp']).optional(),
  sessionId: z.string().min(8).max(64).optional(),
}).refine((body) => body.type !== 'contact_click' || body.channel !== undefined, {
  message: 'A contact click must say which channel it used',
  path: ['channel'],
})

/**
 * A stable visitor key that identifies nobody.
 *
 * The client's per-tab session id is preferred; without one we hash the request
 * IP instead, so "unique visitors" still means something for a visitor with no
 * JavaScript. Either way only the digest is stored — the same trade
 * RegistryPageView.ipHash makes.
 */
function visitorHash(req: Request, sessionId?: string): string {
  const forwarded = req.headers['x-forwarded-for']
  const ip = typeof forwarded === 'string' && forwarded.length > 0
    ? forwarded.split(',')[0].trim()
    : req.ip ?? req.socket?.remoteAddress ?? 'unknown'
  return crypto.createHash('sha256').update(sessionId ?? ip).digest('hex')
}

/**
 * Record one storefront traffic event (the source for GET /me/analytics).
 *
 * Unauthenticated on purpose: it fires from the public storefront, where almost
 * nobody has an account. `publicLimiter` caps it per IP the way routes/auth.ts
 * applies its own limiters, since the app-level limiters in index.ts only cover
 * the /api/public prefix. `optionalAuth` is mounted here rather than leaned on
 * from index.ts, the same way the public GETs below do it, so the owner check
 * cannot quietly stop working if the router is mounted anywhere else.
 */
router.post('/:slug/track', publicLimiter, optionalAuth, asyncHandler(async (req, res) => {
  const parsed = trackSchema.safeParse(req.body ?? {})
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const slug = param(req.params.slug).toLowerCase()
  const storefront = await Storefront.findOne({ slug, status: 'active' }).select('ownerId').lean()
  if (!storefront) { error(res, 'Storefront not found', 404); return }

  // A seller checking their own shop should not inflate their own numbers.
  if (req.user?.userId === storefront.ownerId) { success(res, { recorded: false }); return }

  let recorded = true
  try {
    await StorefrontEvent.create({
      storefrontSlug: slug,
      type: parsed.data.type,
      propertyId: parsed.data.propertyId,
      channel: parsed.data.channel,
      sessionId: parsed.data.sessionId,
      visitorHash: visitorHash(req, parsed.data.sessionId),
    })
  } catch (err) {
    // Best effort, like the registry tracker: a metrics write must never be the
    // reason a public page fails.
    recorded = false
    console.warn('[storefronts/track] write failed:', (err as Error).message)
  }

  success(res, { recorded })
}))

router.get('/:slug', optionalAuth, asyncHandler(async (req, res) => {
  const slug = param(req.params.slug).toLowerCase()
  const storefront = await Storefront.findOne({ slug, status: 'active' }).lean()
  if (!storefront) { error(res, 'Storefront not found', 404); return }

  success(res, {
    ...storefront,
    id: String(storefront._id),
    canonicalUrl: storefront.canonicalDomain
      ? `https://${storefront.canonicalDomain}`
      : `https://${storefront.slug}.userentos.com`,
  })
}))

/**
 * A storefront's listings.
 *
 * Scoped on the SERVER by owner — never by a frontend filter — which is the
 * isolation guarantee the spec calls out and the cross-tenant test asserts.
 */
router.get('/:slug/properties', optionalAuth, asyncHandler(async (req, res) => {
  const slug = param(req.params.slug).toLowerCase()
  const storefront = await Storefront.findOne({ slug, status: 'active' }).lean()
  if (!storefront) { error(res, 'Storefront not found', 404); return }

  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12))
  const filter = publicStorefrontScope(storefront) as unknown as Record<string, unknown>

  const [items, total] = await Promise.all([
    Property.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Property.countDocuments(filter),
  ])

  success(res, {
    items: (items as unknown as Record<string, unknown>[]).map((p) => ({ ...p, id: (p._id as Types.ObjectId).toString() })),
    total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)),
  })
}))

/** A storefront's blog feed — that seller's posts only (§6). */
router.get('/:slug/posts', optionalAuth, asyncHandler(async (req, res) => {
  const slug = param(req.params.slug).toLowerCase()
  const storefront = await Storefront.findOne({ slug, status: 'active' }).lean()
  if (!storefront) { error(res, 'Storefront not found', 404); return }

  const posts = await BlogPost.find({ storefrontId: String(storefront._id), published: true })
    .sort({ createdAt: -1 }).limit(24).lean()

  success(res, {
    items: posts.map((p) => ({ ...p, id: String(p._id) })),
    total: posts.length,
  })
}))

// ─── Admin ───

router.get('/', authenticate, requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
  const filter: Record<string, unknown> = {}
  if (req.query.status) filter.status = req.query.status
  if (search) filter.$or = [{ slug: new RegExp(search, 'i') }, { name: new RegExp(search, 'i') }]

  const items = await Storefront.find(filter).sort({ createdAt: -1 }).limit(100).lean()
  success(res, { items: items.map((s) => ({ ...s, id: String(s._id) })), total: items.length })
}))

router.post('/:id/suspend', authenticate, requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const schema = z.object({ reason: z.string().min(3).max(500), suspend: z.boolean().default(true) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const storefront = await Storefront.findById(param(req.params.id))
  if (!storefront) { error(res, 'Storefront not found', 404); return }

  storefront.status = parsed.data.suspend ? 'suspended' : 'active'
  storefront.suspendedReason = parsed.data.suspend ? parsed.data.reason : undefined
  await storefront.save()

  await recordAudit(req, parsed.data.suspend ? 'storefront.suspended' : 'storefront.reinstated', 'Storefront', String(storefront._id), { reason: parsed.data.reason })
  success(res, { id: String(storefront._id), status: storefront.status }, parsed.data.suspend ? 'Storefront suspended' : 'Storefront reinstated')
}))

export default router

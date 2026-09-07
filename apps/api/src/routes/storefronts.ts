/**
 * Storefront API (spec §4, §13).
 *
 * Entitlements gate every premium action server-side: creating a storefront
 * needs `storefront.enabled`, branding needs `storefront.custom_branding`, and
 * attaching a domain needs `storefront.custom_domain`. The acceptance matrix
 * requires that a seller without the plan "cannot bypass the API", so none of
 * these checks live in the UI.
 */
import { Router } from 'express'
import { z } from 'zod'
import type { Types } from 'mongoose'
import { authenticate, optionalAuth, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { Storefront } from '../models/Storefront.js'
import { StorefrontDomain } from '../models/StorefrontDomain.js'
import { Property } from '../models/Property.js'
import { BlogPost } from '../models/BlogPost.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { recordAudit } from '../utils/audit.js'
import { requireEntitlement, EntitlementError } from '../services/entitlements.js'
import {
  validateSlug, validateDomain, newVerificationToken, checkDomainOwnership,
  publicStorefrontScope,
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

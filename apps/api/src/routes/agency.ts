import { Router } from 'express'
import { z } from 'zod'
import type { Types } from 'mongoose'
import { authenticate, requireRole } from '../middleware/auth.js'
import { AgencyProfile } from '../models/AgencyProfile.js'
import { Delegation } from '../models/Delegation.js'
import { Property } from '../models/Property.js'
import { User } from '../models/User.js'
import { success, error } from '../utils/response.js'
import { param, escapeRegex } from '../utils/params.js'

const router = Router()

const idOf = <T extends { _id: unknown }>(doc: T) => ({
  ...doc,
  id: (doc._id as Types.ObjectId).toString(),
})

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60)
}

/* ================================================================
   AGENCY PROFILES — branded public page for property managers/agents
   ================================================================ */
const agencySchema = z.object({
  name: z.string().min(2),
  description: z.string().max(1000).optional(),
  phone: z.string().min(7),
  email: z.string().email().optional(),
  city: z.string().min(1),
  logo: z.string().optional(),
  teamMembers: z.array(z.object({
    name: z.string().min(2),
    role: z.string().min(2),
    phone: z.string().optional(),
  })).max(20).optional(),
})

// POST /api/agency/me — create or update my agency profile (property_manager/landlord)
router.post('/me', authenticate, requireRole('property_manager', 'landlord'), async (req, res) => {
  const parsed = agencySchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const existing = await AgencyProfile.findOne({ ownerId: req.user!.userId })
  const baseSlug = slugify(parsed.data.name)

  if (existing) {
    // Slug only changes if the new one is free (or already ours).
    if (baseSlug !== existing.slug) {
      const taken = await AgencyProfile.exists({ slug: baseSlug, _id: { $ne: existing._id } })
      existing.slug = taken ? `${baseSlug}-${existing._id.toString().slice(-4)}` : baseSlug
    }
    Object.assign(existing, parsed.data)
    await existing.save()
    success(res, idOf(existing.toObject()), 'Agency profile updated')
    return
  }

  let slug = baseSlug
  if (await AgencyProfile.exists({ slug })) {
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
  }
  const agency = await AgencyProfile.create({ ...parsed.data, slug, ownerId: req.user!.userId })
  success(res, idOf(agency.toObject()), 'Agency profile created', 201)
})

// GET /api/agency/me — my agency profile (or null)
router.get('/me', authenticate, requireRole('property_manager', 'landlord'), async (req, res) => {
  const agency = await AgencyProfile.findOne({ ownerId: req.user!.userId }).lean()
  success(res, { agency: agency ? idOf(agency) : null })
})

/* ================================================================
   DELEGATIONS — owners delegate properties to managers with scopes
   ================================================================ */
const delegationSchema = z.object({
  propertyId: z.string().min(1),
  delegateEmail: z.string().email(),
  scopes: z.array(z.enum(['applications', 'maintenance', 'payments', 'edit', 'leads'])).min(1),
})

// POST /api/agency/delegations — delegate one of MY properties (owner only)
router.post('/delegations', authenticate, requireRole('landlord'), async (req, res) => {
  const parsed = delegationSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const property = await Property.findOne({ _id: param(parsed.data.propertyId), landlordId: req.user!.userId }).lean()
  if (!property) { error(res, 'Property not found', 404); return }

  const delegate = await User.findOne({ email: parsed.data.delegateEmail.toLowerCase() }).lean()
  if (!delegate) { error(res, 'No RentOS account with that email', 404); return }
  const roles = (delegate as { roles?: string[] }).roles ?? []
  if (!roles.includes('property_manager')) { error(res, 'That user is not a property manager', 400); return }

  const delegation = await Delegation.findOneAndUpdate(
    { propertyId: parsed.data.propertyId, delegateId: delegate._id.toString() },
    { ...parsed.data, delegateId: delegate._id.toString(), ownerId: req.user!.userId, status: 'active' },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  )
  success(res, idOf(delegation!.toObject()), 'Property delegated', 201)
})

// GET /api/agency/delegations — as owner (?as=owner) or as delegate (?as=delegate)
router.get('/delegations', authenticate, async (req, res) => {
  const asDelegate = req.query.as === 'delegate'
  const filter: Record<string, unknown> = asDelegate
    ? { delegateId: req.user!.userId, status: 'active' }
    : { ownerId: req.user!.userId, status: 'active' }

  const delegations = await Delegation.find(filter).sort({ createdAt: -1 }).limit(100).lean()
  const propertyIds = [...new Set(delegations.map((d) => d.propertyId))]
  const properties = await Property.find({ _id: { $in: propertyIds } }).select('title address').lean()
  const propertyMap = new Map(properties.map((p) => [(p._id as Types.ObjectId).toString(), p]))

  const userIds = [...new Set(delegations.flatMap((d) => [d.ownerId, d.delegateId]))]
  const users = await User.find({ _id: { $in: userIds } }).select('firstName lastName email').lean()
  const userMap = new Map(users.map((u) => [(u._id as Types.ObjectId).toString(), u]))

  success(res, {
    items: delegations.map((d) => {
      const owner = userMap.get(d.ownerId) as { firstName?: string; lastName?: string; email?: string } | undefined
      const delegate = userMap.get(d.delegateId) as { firstName?: string; lastName?: string; email?: string } | undefined
      return {
        ...idOf(d),
        propertyTitle: (propertyMap.get(d.propertyId) as { title?: string } | undefined)?.title ?? null,
        ownerName: owner ? `${owner.firstName} ${owner.lastName}` : null,
        delegateName: delegate ? `${delegate.firstName} ${delegate.lastName}` : null,
        delegateEmail: delegate?.email ?? null,
      }
    }),
  })
})

// DELETE /api/agency/delegations/:id — revoke (owner only)
router.delete('/delegations/:id', authenticate, requireRole('landlord'), async (req, res) => {
  const delegation = await Delegation.findById(param(req.params.id))
  if (!delegation || delegation.ownerId !== req.user!.userId) { error(res, 'Delegation not found', 404); return }

  delegation.status = 'revoked'
  await delegation.save()
  success(res, null, 'Delegation revoked')
})

// GET /api/agency/:slug — public branded agency page (+ its published listings)
router.get('/:slug', async (req, res) => {
  const agency = await AgencyProfile.findOne({ slug: new RegExp(`^${escapeRegex(String(req.params.slug))}$`, 'i') }).lean()
  if (!agency) { error(res, 'Agency not found', 404); return }

  const listings = await Property.find({ landlordId: agency.ownerId, status: 'available' })
    .select('title type rentAmount bedrooms bathrooms address images')
    .limit(24)
    .lean()

  success(res, {
    agency: idOf(agency),
    listings: listings.map(idOf),
  })
})

export default router

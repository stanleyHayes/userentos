import { Request, Response } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { propertyService } from '../container.js'
import { Property } from '../models/Property.js'
import { User } from '../models/User.js'
import { success, error } from '../utils/response.js'
import { param, escapeRegex } from '../utils/params.js'
import { uploadToCloudinary } from '../utils/cloudinary.js'
import { notify, notifyPropertyApproved, notifyPropertyRejected } from '../services/notify.js'
import { checkAndAward } from '../services/achievements.js'
import { embed } from '../services/embeddings.js'
import { cache } from '../services/cache.js'

interface LeanProperty {
  _id: Types.ObjectId
  id?: string
  landlordId?: string
  listingStatus?: string
  preferences?: {
    minCreditScore?: number
    allowSmokers?: boolean
    allowPets?: boolean
    allowChildren?: boolean
    requireProfileComplete?: boolean
  }
  status?: string
  address?: { city?: string }
  type?: string
  rentAmount?: number
  amenities?: string[]
  createdAt?: Date
}

interface LeanTenantProfile {
  smoker?: boolean
  pets?: boolean
  hasChildren?: boolean
  profileComplete?: boolean
  searchPreferences?: {
    preferredCities?: string[]
    preferredRegions?: string[]
    preferredType?: string[]
    maxBudget?: number
    minBudget?: number
    minBedrooms?: number
    needsFurnished?: boolean
    needsParking?: boolean
    preferredAmenities?: string[]
  }
}

function buildPropertyEmbeddingText(data: { title: string; description: string; type: string; address?: { city?: string; region?: string }; rentAmount?: number; bedrooms?: number; bathrooms?: number; furnished?: boolean; amenities?: string[] }): string {
  const parts: string[] = [
    data.title,
    data.description,
    `${data.type} for rent`,
  ]
  if (data.address?.city) parts.push(`in ${data.address.city}`)
  if (data.address?.region) parts.push(`region ${data.address.region}`)
  if (data.rentAmount) parts.push(`GHS ${data.rentAmount}`)
  if (data.bedrooms) parts.push(`${data.bedrooms} bedroom${data.bedrooms > 1 ? 's' : ''}`)
  if (data.bathrooms) parts.push(`${data.bathrooms} bathroom${data.bathrooms > 1 ? 's' : ''}`)
  if (data.furnished) parts.push('furnished')
  if (data.amenities?.length) parts.push(`amenities: ${data.amenities.join(', ')}`)
  return parts.join('. ')
}

const createPropertySchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  type: z.enum(['apartment', 'house', 'room', 'commercial', 'warehouse', 'studio', 'townhouse', 'hostel', 'shared_room']),
  address: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    region: z.string().min(1),
    digitalAddress: z.string().optional(),
  }),
  rentAmount: z.number().positive(),
  rentDurationMonths: z.number().int().positive(),
  advanceMonths: z.number().int().min(0).max(6),
  rules: z.array(z.string()).default([]),
  amenities: z.array(z.string()).default([]),
  coordinates: z.object({ lat: z.number(), lng: z.number() }).optional(),
})

export const propertyController = {
  list: async (req: Request, res: Response) => {
    const q = req.query

    const filters: Record<string, unknown> = {
      status: q.status as string | undefined,
      type: q.type as string | undefined,
      city: q.city as string | undefined,
      region: q.region as string | undefined,
      neighborhood: q.neighborhood as string | undefined,
      minRent: q.minRent ? Number(q.minRent) : undefined,
      maxRent: q.maxRent ? Number(q.maxRent) : undefined,
      minBedrooms: q.minBedrooms ? Number(q.minBedrooms) : undefined,
      minBathrooms: q.minBathrooms ? Number(q.minBathrooms) : undefined,
      furnished: q.furnished === 'true' ? true : undefined,
      parking: q.parking === 'true' ? true : undefined,
      amenities: q.amenities ? (q.amenities as string).split(',').map((s) => s.trim()) : undefined,
      accessibility: q.accessibility ? (q.accessibility as string).split(',').map((s) => s.trim()) : undefined,
      search: q.search as string | undefined,
      sort: q.sort as string | undefined,
    }

    // Only show draft/pending properties to their owners or admins. `mine=true`
    // scopes the list to the caller's own properties (any status); otherwise a
    // landlord/manager browses all approved listings plus their own (the
    // non-approved filter is applied post-query below, since listProperties
    // can't express "approved OR mine").
    const user = req.user
    const isLandlordRole = !!user && (user.roles.includes('landlord') || user.roles.includes('property_manager'))
    const isAdmin = !!user && (user.roles.includes('admin') || user.roles.includes('super_admin'))
    const ownOnly = !!user && q.mine === 'true'
    if (ownOnly) {
      filters.landlordId = user!.userId
    } else if (!isLandlordRole && !isAdmin) {
      // Tenants, other roles, and unauthenticated: hide draft/pending/rejected
      filters.listingStatus = 'approved'
    }

    const result = await propertyService.listProperties(filters)
    let items = result.items

    // Browsing landlord/manager: hide other landlords' draft/pending/rejected
    // listings, but keep their own of any status.
    if (!ownOnly && isLandlordRole && !isAdmin) {
      items = items.filter((p) => (p as LeanProperty).listingStatus === 'approved' || (p as LeanProperty).landlordId === user!.userId)
    }

    // For government users, show occupied properties that are ending soon or not renewing
    if (user?.roles.includes('government')) {
      const now = new Date()
      const threeMonthsFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

      const { Agreement } = await import('../models/Agreement.js')
      const activeAgreements = await Agreement.find({
        status: 'active',
        endDate: { $lte: threeMonthsFromNow.toISOString() },
      }).lean()

      if (activeAgreements.length > 0) {
        const agreementByProperty = new Map(
          activeAgreements.map((a) => [a.propertyId, a])
        )

        items = items.filter((p) => {
          if (p.status !== 'occupied') return true

          const pid = (p._id as Types.ObjectId)?.toString?.() ?? p.id
          const agreement = agreementByProperty.get(pid)

          // No active agreement found — show it (might be transitioning)
          if (!agreement) return true

          const endDate = new Date(agreement.endDate)
          const endsWithin3Months = endDate <= threeMonthsFromNow
          const notRenewing = agreement.renewalStatus === 'landlord_declined'
            || agreement.renewalStatus === 'tenant_declined'
            || agreement.renewalStatus === 'none'

          // Only show if lease is ending soon AND not being renewed
          return endsWithin3Months && notRenewing
        })
      }
    }

    // Tenant exclusion: if tenant is logged in, filter out properties whose preferences exclude them
    if (user?.roles.includes('tenant')) {
      const { TenantProfile } = await import('../models/TenantProfile.js')
      const { CreditScore } = await import('../models/CreditScore.js')
      const profile = await TenantProfile.findOne({ userId: user.userId }).lean()
      const credit = await CreditScore.findOne({ userId: user.userId }).lean()

      if (profile) {
        items = items.filter((p) => {
          const prefs = (p as LeanProperty).preferences
          if (!prefs) return true
          if ((prefs.minCreditScore ?? 0) > 0 && (credit?.score ?? 0) < (prefs.minCreditScore ?? 0)) return false
          if (!prefs.allowSmokers && (profile as LeanTenantProfile).smoker) return false
          if (!prefs.allowPets && (profile as LeanTenantProfile).pets) return false
          if (!prefs.allowChildren && (profile as LeanTenantProfile).hasChildren) return false
          if (prefs.requireProfileComplete && !(profile as LeanTenantProfile).profileComplete) return false
          return true
        })
      }
    }

    success(res, { items, total: items.length, page: 1, pageSize: 50, totalPages: 1 })
  },

  getById: async (req: Request, res: Response) => {
    const id = param(req.params.id)
    const user = req.user

    const property = await Property.findById(id).lean()
    if (!property) { error(res, 'Property not found', 404); return }

    // Authorization: draft/pending/rejected properties are only visible to
    // their landlord, admins, or super_admins
    const isOwner = user && property.landlordId === user.userId
    const isAdmin = user && (user.roles.includes('admin') || user.roles.includes('super_admin'))
    const isPublic = property.listingStatus === 'approved'

    if (!isPublic && !isOwner && !isAdmin) {
      error(res, 'Property not found', 404)
      return
    }

    success(res, { ...property, id: (property._id as Types.ObjectId).toString() })
  },

  create: async (req: Request, res: Response) => {
    const parsed = createPropertySchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    const result = await propertyService.create(parsed.data, req.user!.userId)

    // Generate embedding for semantic search (fire-and-forget)
    try {
      const property = await Property.findById(result.data.id)
      if (property) {
        const text = buildPropertyEmbeddingText(property.toObject())
        const { embedding } = await embed(text)
        property.embedding = embedding
        await property.save()
      }
    } catch (err) {
      console.warn('[Property] Embedding generation failed:', err instanceof Error ? err.message : String(err))
    }

    cache.invalidatePattern('semantic-search:*').catch(() => {})
    success(res, result.data, 'Property created', result.status)
  },

  update: async (req: Request, res: Response) => {
    const result = await propertyService.update(param(req.params.id), req.body, req.user!.userId)
    if (result.error) { error(res, result.error, result.status); return }

    // Regenerate embedding if content changed (fire-and-forget)
    try {
      const property = await Property.findById(param(req.params.id))
      if (property) {
        const text = buildPropertyEmbeddingText(property.toObject())
        const { embedding } = await embed(text)
        property.embedding = embedding
        await property.save()
      }
    } catch (err) {
      console.warn('[Property] Embedding regeneration failed:', err instanceof Error ? err.message : String(err))
    }

    cache.invalidatePattern('semantic-search:*').catch(() => {})
    success(res, result.data)
  },

  delete: async (req: Request, res: Response) => {
    const result = await propertyService.delete(param(req.params.id), req.user!.userId)
    if (result.error) { error(res, result.error, result.status); return }

    success(res, result.data, result.message)
  },

  publish: async (req: Request, res: Response) => {
    const property = await Property.findById(param(req.params.id))
    if (!property) { error(res, 'Property not found', 404); return }
    if (property.landlordId !== req.user!.userId) { error(res, 'Not authorized', 403); return }

    property.listingStatus = 'pending_review'
    await property.save()

    // Notify admins (best-effort) — a literal 'admin' userId reaches no one.
    User.find({ roles: { $in: ['admin', 'super_admin'] } }).select('_id').lean()
      .then((admins) => {
        for (const admin of admins) {
          notify({
            userId: (admin._id as Types.ObjectId).toString(),
            title: 'Property Pending Review',
            message: `"${property.title}" has been submitted for review.`,
            actionUrl: `/admin/properties`,
          })
        }
      })
      .catch((err) => console.warn('[Property] admin notify failed:', err))

    success(res, { ...property.toObject(), id: property._id.toString() }, 'Property submitted for review')
  },

  review: async (req: Request, res: Response) => {
    const { status, rejectionReason } = req.body
    if (!['approved', 'rejected'].includes(status)) {
      error(res, 'Status must be approved or rejected')
      return
    }

    const property = await Property.findById(param(req.params.id))
    if (!property) { error(res, 'Property not found', 404); return }
    if (property.listingStatus !== 'pending_review') {
      error(res, 'Property is not pending review')
      return
    }

    property.listingStatus = status
    property.reviewedBy = req.user!.userId
    property.reviewedAt = new Date()
    if (status === 'approved') {
      property.publishedAt = new Date()
    } else {
      property.rejectionReason = rejectionReason || ''
    }
    await property.save()

    if (status === 'approved') {
      notifyPropertyApproved(property.landlordId, property.title)
      checkAndAward(property.landlordId, 'first_property_listed', { propertyId: property._id.toString() })
        .catch((err) => console.warn('[Property] checkAndAward failed:', err.message))
    } else {
      notifyPropertyRejected(property.landlordId, property.title, property.rejectionReason)
    }

    success(res, { ...property.toObject(), id: property._id.toString() }, `Property ${status}`)
  },

  uploadImages: async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[]
    if (!files || files.length === 0) { error(res, 'No images uploaded'); return }

    const property = await Property.findById(param(req.params.id))
    if (!property) { error(res, 'Property not found', 404); return }
    if (property.landlordId !== req.user!.userId) { error(res, 'Not authorized', 403); return }

    const uploaded = await Promise.all(
      files.map(async (file) => {
        const result = await uploadToCloudinary(file.buffer, { folder: 'properties', resourceType: 'image' })
        return result.url
      }),
    )

    property.images.push(...uploaded)
    await property.save()

    success(res, { images: property.images }, 'Images uploaded')
  },

  toggleFavorite: async (req: Request, res: Response) => {
    const propertyId = param(req.params.id)
    const userId = req.user!.userId

    const propertyExists = await Property.exists({ _id: propertyId })
    if (!propertyExists) { error(res, 'Property not found', 404); return }

    const { Favorite } = await import('../models/Favorite.js')
    const existing = await Favorite.findOne({ userId, propertyId })

    if (existing) {
      await existing.deleteOne()
      await Property.updateOne({ _id: propertyId, favorites: { $gt: 0 } }, { $inc: { favorites: -1 } })
      success(res, { favorited: false })
    } else {
      await Favorite.create({ userId, propertyId })
      await Property.updateOne({ _id: propertyId }, { $inc: { favorites: 1 } })
      success(res, { favorited: true })
    }
  },

  getFavoritesMe: async (req: Request, res: Response) => {
    const { Favorite } = await import('../models/Favorite.js')
    const favorites = await Favorite.find({ userId: req.user!.userId }).lean()
    const propertyIds = favorites.map((f) => f.propertyId)
    // Only published listings — a draft/pending property must not be readable via favorites.
    const properties = await Property.find({ _id: { $in: propertyIds }, listingStatus: 'approved' }).lean()

    success(res, {
      items: properties.map((p) => ({ ...p, id: (p._id as Types.ObjectId).toString() })),
      total: properties.length,
    })
  },

  pendingReview: async (_req: Request, res: Response) => {
    const properties = await Property.find({ listingStatus: 'pending_review' }).sort({ createdAt: -1 }).lean()
    const items = properties.map((p) => ({ ...p, id: (p._id as Types.ObjectId).toString() }))

    success(res, { items, total: items.length })
  },

  qualify: async (req: Request, res: Response) => {
    const property = await Property.findById(param(req.params.id)).lean()
    if (!property) { error(res, 'Property not found', 404); return }

    const { TenantProfile } = await import('../models/TenantProfile.js')
    const { CreditScore } = await import('../models/CreditScore.js')
    const profile = await TenantProfile.findOne({ userId: req.user!.userId }).lean()
    const credit = await CreditScore.findOne({ userId: req.user!.userId }).lean()

    const prefs = (property as LeanProperty).preferences
    const issues: string[] = []

    if (prefs?.minCreditScore && (credit?.score ?? 0) < prefs.minCreditScore) {
      issues.push(`Credit score too low (needs ${prefs.minCreditScore}, you have ${credit?.score ?? 0})`)
    }
    if (!prefs?.allowSmokers && (profile as LeanTenantProfile)?.smoker) {
      issues.push('Property does not allow smokers')
    }
    if (!prefs?.allowPets && (profile as LeanTenantProfile)?.pets) {
      issues.push('Property does not allow pets')
    }
    if (!prefs?.allowChildren && (profile as LeanTenantProfile)?.hasChildren) {
      issues.push('Property does not allow children')
    }
    if (prefs?.requireProfileComplete && !(profile as LeanTenantProfile)?.profileComplete) {
      issues.push('Your profile is incomplete')
    }

    success(res, { qualified: issues.length === 0, issues, propertyId: (property._id as Types.ObjectId).toString() })
  },

  recommendations: async (req: Request, res: Response) => {
    const { TenantProfile } = await import('../models/TenantProfile.js')
    const { CreditScore } = await import('../models/CreditScore.js')

    const profile = await TenantProfile.findOne({ userId: req.user!.userId }).lean()
    const credit = await CreditScore.findOne({ userId: req.user!.userId }).lean()

    const filter: Record<string, unknown> = { status: 'available', listingStatus: 'approved' }
    const prefs = (profile as LeanTenantProfile)?.searchPreferences

    if (prefs) {
      if (prefs.preferredCities?.length) filter['address.city'] = { $in: prefs.preferredCities.map((c: string) => new RegExp(escapeRegex(c), 'i')) }
      if (prefs.preferredRegions?.length) filter['address.region'] = { $in: prefs.preferredRegions.map((r: string) => new RegExp(escapeRegex(r), 'i')) }
      if (prefs.preferredType?.length) filter.type = { $in: prefs.preferredType }
      if ((prefs.maxBudget ?? 0) > 0) filter.rentAmount = { $lte: prefs.maxBudget, ...((prefs.minBudget ?? 0) > 0 ? { $gte: prefs.minBudget } : {}) }
      if ((prefs.minBedrooms ?? 0) > 0) filter.bedrooms = { $gte: prefs.minBedrooms }
      if (prefs.needsFurnished) filter.furnished = true
      if (prefs.needsParking) filter.parkingSpaces = { $gte: 1 }
    }

    let properties = await Property.find(filter).sort({ createdAt: -1 }).limit(20).lean()

    // Filter out properties whose landlord preferences exclude this tenant
    if (profile) {
      properties = properties.filter((prop) => {
        const lp = (prop as LeanProperty).preferences
        if (!lp) return true
        if (lp.minCreditScore && (credit?.score ?? 0) < lp.minCreditScore) return false
        if (!lp.allowSmokers && (profile as LeanTenantProfile).smoker) return false
        if (!lp.allowPets && (profile as LeanTenantProfile).pets) return false
        if (!lp.allowChildren && (profile as LeanTenantProfile).hasChildren) return false
        if (lp.requireProfileComplete && !(profile as LeanTenantProfile).profileComplete) return false
        return true
      })
    }

    // Score each property for relevance
    const scored = properties.map((p) => {
      let matchScore = 50 // base
      if (prefs?.preferredCities?.some((c: string) => (p.address.city ?? '').toLowerCase().includes(c.toLowerCase()))) matchScore += 20
      if (prefs?.preferredType?.includes(p.type)) matchScore += 15
      if (prefs?.maxBudget && p.rentAmount <= prefs.maxBudget) matchScore += 10
      if (prefs?.preferredAmenities?.some((a: string) => p.amenities?.includes(a))) matchScore += 5
      return { ...p, id: (p._id as Types.ObjectId).toString(), matchScore: Math.min(100, matchScore) }
    })

    scored.sort((a, b) => b.matchScore - a.matchScore)

    success(res, { items: scored, total: scored.length })
  },
}

import { Types } from 'mongoose'
import { requireQuota, EntitlementError } from './entitlements.js'
import type { Logger } from 'winston'
import type { PropertyRepository } from '../repositories/index.js'
import type { IProperty } from '../models/Property.js'
import { hasDelegatedScope } from './delegation.js'
import { PUBLICLY_VISIBLE_STATUSES } from './propertyReview.js'
import { recordErasure, completeErasure } from './erasureLedger.js'
import { propertyImageAssets, eraseStoredAssets } from './propertyImages.js'

interface CreatePropertyData {
  title: string
  description: string
  type: string
  address: { street: string; city: string; region: string; digitalAddress?: string }
  rentAmount: number
  rentDurationMonths: number
  advanceMonths: number
  rules?: string[]
  amenities?: string[]
}

interface UpdatePropertyData {
  title?: string
  description?: string
  rentAmount?: number
  status?: string
  rules?: string[]
  amenities?: string[]
  coordinates?: { lat: number; lng: number }
}

interface ListFilters {
  /** Owners whose listings must not appear (closed accounts). */
  excludeLandlordIds?: string[]
  status?: string
  listingStatus?: string | readonly string[]
  type?: string
  city?: string
  region?: string
  neighborhood?: string
  minRent?: number
  maxRent?: number
  minBedrooms?: number
  minBathrooms?: number
  furnished?: boolean
  parking?: boolean
  amenities?: string[]
  accessibility?: string[]
  search?: string
  sort?: string
  landlordId?: string
  page?: number
  pageSize?: number
}

/**
 * The only statuses a landlord picks by hand. 'occupied' and 'under_dispute'
 * are lifecycle states owned by the lease (signing, move-out) and dispute
 * workflows — letting the owner set them would clear an active dispute or
 * advertise a let property as available.
 */
const LANDLORD_SETTABLE_STATUSES = ['available', 'maintenance_required']

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export class PropertyService {
  constructor(
    private readonly propertyRepo: PropertyRepository,
    private readonly logger: Logger,
  ) {}

  async listProperties(filters: ListFilters) {
    const filter: Record<string, unknown> = {}

    if (filters.landlordId) filter.landlordId = filters.landlordId
    else if (filters.excludeLandlordIds?.length) filter.landlordId = { $nin: filters.excludeLandlordIds }
    if (filters.status) filter.status = filters.status
    if (filters.listingStatus) filter.listingStatus = typeof filters.listingStatus === 'string' ? filters.listingStatus : { $in: [...filters.listingStatus] }
    if (filters.type) filter.type = filters.type
    if (filters.city) filter['address.city'] = { $regex: escapeRegex(filters.city), $options: 'i' }
    if (filters.region) filter['address.region'] = { $regex: escapeRegex(filters.region), $options: 'i' }
    if (filters.neighborhood) filter['address.neighborhood'] = { $regex: escapeRegex(filters.neighborhood), $options: 'i' }

    if (filters.minRent || filters.maxRent) {
      const rentFilter: Record<string, number> = {}
      if (filters.minRent) rentFilter.$gte = filters.minRent
      if (filters.maxRent) rentFilter.$lte = filters.maxRent
      filter.rentAmount = rentFilter
    }

    if (filters.minBedrooms) filter.bedrooms = { $gte: filters.minBedrooms }
    if (filters.minBathrooms) filter.bathrooms = { $gte: filters.minBathrooms }
    if (filters.furnished) filter.furnished = true
    if (filters.parking) filter.parkingSpaces = { $gte: 1 }
    if (filters.amenities?.length) filter.amenities = { $all: filters.amenities }

    if (filters.accessibility?.length) {
      const validKeys = new Set([
        'wheelchairAccessible', 'stepFreeEntry', 'elevator', 'accessibleBathroom',
        'hearingLoop', 'brailleSignage', 'groundFloorOnly',
      ])
      for (const key of filters.accessibility) {
        if (validKeys.has(key)) filter[`accessibility.${key}`] = true
      }
    }

    if (filters.search) {
      const escaped = escapeRegex(filters.search)
      filter.$or = [
        { title: { $regex: escaped, $options: 'i' } },
        { description: { $regex: escaped, $options: 'i' } },
        { 'address.city': { $regex: escaped, $options: 'i' } },
        { 'address.neighborhood': { $regex: escaped, $options: 'i' } },
      ]
    }

    let sort: Record<string, 1 | -1> = { createdAt: -1 }
    if (filters.sort === 'price_asc') sort = { rentAmount: 1 }
    else if (filters.sort === 'price_desc') sort = { rentAmount: -1 }
    else if (filters.sort === 'newest') sort = { createdAt: -1 }
    else if (filters.sort === 'popular') sort = { views: -1 }

    const properties = await this.propertyRepo.search(filter, sort)

    // repo.search has no skip/limit support — paginate the result set here so
    // the metadata is honest (previously hardcoded to page 1 of 1, which hid
    // results past the first 50 from paginating clients).
    const page = Math.max(1, filters.page ?? 1)
    const pageSize = Math.max(1, filters.pageSize ?? 50)
    const total = properties.length
    const items = properties
      .slice((page - 1) * pageSize, page * pageSize)
      .map((p) => ({ ...p, id: (p._id as Types.ObjectId).toString() }))

    this.logger.debug(`Listed ${items.length} of ${total} properties with filters: ${JSON.stringify(filters)}`)

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
  }

  async getById(id: string) {
    const property = await this.propertyRepo.findById(id, { lean: true })
    if (!property) {
      return { error: 'Property not found', status: 404 }
    }
    return { data: { ...property, id: (property._id as Types.ObjectId).toString() } }
  }

  async create(data: CreatePropertyData, userId: string) {
    // Enforce the active-property limit through the entitlement engine rather
    // than reading plan columns directly (spec §7.3). The engine resolves the
    // subscriber's plan version, applies its `property.limit` grant and falls
    // back to the free-tier default, so no code here branches on a plan name.
    await this.propertyRepo.ensureQuotaIndex()
    for (let attempt = 0; attempt < 8; attempt++) {
      // One projected read provides both the occupancy count and slot inventory.
      // Legacy documents without a slot still consume quota. Always choosing the
      // lowest vacant slot makes competing requests meet at the unique index.
      const existing = await this.propertyRepo.findMany({ landlordId: userId }, { select: 'quotaSlot', lean: true })
      try { await requireQuota(userId, 'property.limit', existing.length, 'Active property limit') }
      catch (err) {
        if (err instanceof EntitlementError) return { error: err.message, status: 403 }
        throw err
      }
      const occupied = new Set(existing.map(item => item.quotaSlot).filter((slot): slot is number => typeof slot === 'number'))
      let quotaSlot = 0
      while (occupied.has(quotaSlot)) quotaSlot++
      try {
        const property = await this.propertyRepo.create({ ...data, landlordId: userId, quotaSlot, status: 'available', listingStatus: 'draft' } as Partial<IProperty>)
        this.logger.info(`Property created: "${data.title}" by user ${userId}`)
        return { data: { ...property.toObject(), id: property._id.toString() }, status: 201 }
      } catch (failure) {
        const duplicate = failure as { code?: number; keyPattern?: Record<string, number> }
        if (duplicate.code !== 11000 || duplicate.keyPattern?.landlordId !== 1 || duplicate.keyPattern?.quotaSlot !== 1) throw failure
      }
    }
    return { error: 'Another property is being created. Please try again.', status: 409 }
  }

  async update(id: string, data: UpdatePropertyData, userId: string) {
    const property = await this.propertyRepo.findById(id)
    if (!property) {
      return { error: 'Property not found', status: 404 }
    }
    if (property.landlordId !== userId && !(await hasDelegatedScope(userId, id, 'edit'))) {
      this.logger.warn(`Unauthorized property update attempt: user ${userId} on property ${id}`)
      return { error: 'Not authorized', status: 403 }
    }

    if (data.status !== undefined && data.status !== property.status
      && (!LANDLORD_SETTABLE_STATUSES.includes(data.status) || !LANDLORD_SETTABLE_STATUSES.includes(property.status))) {
      return { error: `A property cannot be moved from "${property.status}" to "${data.status}" manually`, status: 409 }
    }

    // Content changes to an already-approved listing must go back through
    // moderation — otherwise approval can be bypassed by editing after the fact.
    // House rules are listing content too (they can carry unlawful terms).
    const contentChanged =
      (data.title !== undefined && data.title !== property.title) ||
      (data.description !== undefined && data.description !== property.description) ||
      (data.rentAmount !== undefined && data.rentAmount !== property.rentAmount) ||
      (data.rules !== undefined && JSON.stringify(data.rules) !== JSON.stringify(property.rules ?? [])) ||
      (data.amenities !== undefined && JSON.stringify(data.amenities) !== JSON.stringify(property.amenities))

    if (data.title) property.title = data.title
    if (data.description) property.description = data.description
    if (data.rentAmount) property.rentAmount = data.rentAmount
    if (data.status) property.status = data.status
    if (data.rules) property.rules = data.rules
    if (data.amenities) property.amenities = data.amenities

    // Pinning a location is how a listing gets onto the map. It refines the
    // address already on the listing rather than changing it, so it is
    // deliberately NOT treated as a content change — otherwise correcting a pin
    // would pull an approved listing back into the moderation queue and
    // landlords would simply never do it.
    if (data.coordinates) {
      const { lat, lng } = data.coordinates
      if (
        typeof lat !== 'number' || typeof lng !== 'number'
        || !Number.isFinite(lat) || !Number.isFinite(lng)
        || lat < -90 || lat > 90 || lng < -180 || lng > 180
      ) {
        return { error: 'Coordinates must be a valid latitude and longitude', status: 400 }
      }
      property.coordinates = { lat, lng }
    }
    if (contentChanged && (PUBLICLY_VISIBLE_STATUSES as readonly string[]).includes(property.listingStatus)) {
      property.listingStatus = 'pending_review'
      this.logger.info(`Property ${id} content changed — returned to pending_review`)
    }
    await property.save()

    this.logger.info(`Property updated: ${id} by user ${userId}`)
    return { data: { ...property.toObject(), id: property._id.toString() } }
  }

  async delete(id: string, userId: string) {
    const property = await this.propertyRepo.findById(id)
    if (!property) {
      return { error: 'Property not found', status: 404 }
    }
    if (property.landlordId !== userId) {
      this.logger.warn(`Unauthorized property delete attempt: user ${userId} on property ${id}`)
      return { error: 'Not authorized', status: 403 }
    }

    // Ledger first (a restored backup must not bring the listing back), then
    // the photos, then the record — which stays if the file host does not
    // confirm, so a retry can finish the job.
    const assets = propertyImageAssets(property)
    const entryId = await recordErasure({ subjectId: userId, scope: 'property', source: 'owner', recordIds: [id], storageAssets: assets })
    await eraseStoredAssets(assets)
    await property.deleteOne()
    await completeErasure(entryId)
    this.logger.info(`Property deleted: ${id} by user ${userId}`)
    return { data: null, message: 'Property deleted' }
  }

  async incrementViews(ids: string[]) {
    if (ids.length > 0) {
      await this.propertyRepo.incrementViews(ids)
    }
  }
}

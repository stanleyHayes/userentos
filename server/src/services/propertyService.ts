import { Types } from 'mongoose'
import type { Logger } from 'winston'
import type { PropertyRepository } from '../repositories/index.js'
import type { IProperty } from '../models/Property.js'
import { User } from '../models/User.js'
import { SubscriptionPackage } from '../models/SubscriptionPackage.js'

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
}

interface ListFilters {
  status?: string
  listingStatus?: string
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
    if (filters.status) filter.status = filters.status
    if (filters.listingStatus) filter.listingStatus = filters.listingStatus
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
    // Enforce subscription listing limits. A user WITH a package is capped by it;
    // an EXPIRED subscription blocks new listings until renewed (previously
    // subscriptionEndDate was written but never enforced anywhere).
    const user = await User.findById(userId).lean()
    if (user?.subscriptionPackageId) {
      const isExpired = !!user.subscriptionEndDate && new Date(user.subscriptionEndDate) < new Date()
      if (isExpired) {
        return { error: 'Your subscription has expired. Renew it to add more properties.', status: 403 }
      }
      const pkg = await SubscriptionPackage.findById(user.subscriptionPackageId).lean()
      if (pkg && pkg.maxProperties !== -1) {
        const count = await this.propertyRepo.count({ landlordId: userId })
        if (count >= pkg.maxProperties) {
          return { error: `Your ${pkg.name} package allows up to ${pkg.maxProperties} propert${pkg.maxProperties === 1 ? 'y' : 'ies'}. Upgrade to add more.`, status: 403 }
        }
      }
    }

    const property = await this.propertyRepo.create({
      ...data,
      landlordId: userId,
      status: 'available',
      listingStatus: 'draft',
    } as Partial<IProperty>)

    this.logger.info(`Property created: "${data.title}" by user ${userId}`)
    return { data: { ...property.toObject(), id: property._id.toString() }, status: 201 }
  }

  async update(id: string, data: UpdatePropertyData, userId: string) {
    const property = await this.propertyRepo.findById(id)
    if (!property) {
      return { error: 'Property not found', status: 404 }
    }
    if (property.landlordId !== userId) {
      this.logger.warn(`Unauthorized property update attempt: user ${userId} on property ${id}`)
      return { error: 'Not authorized', status: 403 }
    }

    // Content changes to an already-approved listing must go back through
    // moderation — otherwise approval can be bypassed by editing after the fact.
    const contentChanged =
      (data.title !== undefined && data.title !== property.title) ||
      (data.description !== undefined && data.description !== property.description) ||
      (data.rentAmount !== undefined && data.rentAmount !== property.rentAmount) ||
      (data.amenities !== undefined && JSON.stringify(data.amenities) !== JSON.stringify(property.amenities))

    if (data.title) property.title = data.title
    if (data.description) property.description = data.description
    if (data.rentAmount) property.rentAmount = data.rentAmount
    if (data.status) property.status = data.status
    if (data.rules) property.rules = data.rules
    if (data.amenities) property.amenities = data.amenities
    if (contentChanged && property.listingStatus === 'approved') {
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

    await property.deleteOne()
    this.logger.info(`Property deleted: ${id} by user ${userId}`)
    return { data: null, message: 'Property deleted' }
  }

  async incrementViews(ids: string[]) {
    if (ids.length > 0) {
      await this.propertyRepo.incrementViews(ids)
    }
  }
}

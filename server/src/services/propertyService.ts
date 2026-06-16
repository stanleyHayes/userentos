import { Types } from 'mongoose'
import type { Logger } from 'winston'
import type { PropertyRepository } from '../repositories/index.js'
import type { IProperty } from '../models/Property.js'

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
    const items = properties.map((p) => ({ ...p, id: (p._id as Types.ObjectId).toString() }))

    this.logger.debug(`Listed ${items.length} properties with filters: ${JSON.stringify(filters)}`)

    return { items, total: items.length, page: 1, pageSize: 50, totalPages: 1 }
  }

  async getById(id: string) {
    const property = await this.propertyRepo.findById(id, { lean: true })
    if (!property) {
      return { error: 'Property not found', status: 404 }
    }
    return { data: { ...property, id: (property._id as Types.ObjectId).toString() } }
  }

  async create(data: CreatePropertyData, userId: string) {
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

    if (data.title) property.title = data.title
    if (data.description) property.description = data.description
    if (data.rentAmount) property.rentAmount = data.rentAmount
    if (data.status) property.status = data.status
    if (data.rules) property.rules = data.rules
    if (data.amenities) property.amenities = data.amenities
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

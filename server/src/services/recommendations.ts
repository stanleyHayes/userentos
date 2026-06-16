import { Types } from 'mongoose'
import { Property } from '../models/Property.js'
import { TenantProfile } from '../models/TenantProfile.js'
import { CreditScore } from '../models/CreditScore.js'
import { Favorite } from '../models/Favorite.js'
import { Application } from '../models/Application.js'
import type { ITenantProfile } from '../models/TenantProfile.js'
import type { IProperty } from '../models/Property.js'
import { embed, cosineSimilarity } from './embeddings.js'
import { logger } from '../utils/logger.js'

export interface ScoredProperty {
  id: string
  title: string
  type: string
  rentAmount: number
  address: { city: string; region: string; neighborhood?: string }
  bedrooms: number
  bathrooms: number
  furnished: boolean
  amenities: string[]
  images: string[]
  matchScore: number
  matchReasons: string[]
}

/**
 * Build a user preference text for embedding-based similarity.
 */
function buildUserPreferenceText(profile: ITenantProfile | null | undefined): string {
  const prefs = profile?.searchPreferences
  const parts: string[] = []

  if (prefs?.preferredType?.length) {
    parts.push(`Looking for ${prefs.preferredType.join(', ')}`)
  }
  if (prefs?.preferredCities?.length) {
    parts.push(`in ${prefs.preferredCities.join(', ')}`)
  }
  if (prefs?.preferredRegions?.length) {
    parts.push(`region ${prefs.preferredRegions.join(', ')}`)
  }
  if (prefs && prefs.maxBudget > 0) {
    parts.push(`budget around GHS ${prefs.maxBudget}`)
  }
  if (prefs && prefs.minBedrooms > 0) {
    parts.push(`${prefs.minBedrooms} bedroom${prefs.minBedrooms > 1 ? 's' : ''}`)
  }
  if (prefs?.needsFurnished) {
    parts.push('furnished')
  }
  if (prefs?.needsParking) {
    parts.push('with parking')
  }
  if (prefs?.preferredAmenities?.length) {
    parts.push(`amenities: ${prefs.preferredAmenities.join(', ')}`)
  }

  // Lifestyle preferences from profile
  if (profile?.hasChildren) parts.push('family-friendly')
  if (profile?.pets) parts.push('pet-friendly')
  if (profile?.smoker) parts.push('smoker-friendly')

  return parts.join('. ') || 'rental property in Ghana'
}

/**
 * Build a property description text for embedding.
 */
function buildPropertyText(p: IProperty): string {
  const parts: string[] = [
    p.title,
    p.description,
    `${p.bedrooms} bedroom ${p.type} in ${p.address?.city || ''}`,
    `GHS ${p.rentAmount} per month`,
  ]
  if (p.furnished) parts.push('furnished')
  if (p.parkingSpaces > 0) parts.push('with parking')
  if (p.amenities?.length) parts.push(`amenities: ${p.amenities.join(', ')}`)
  return parts.join('. ')
}

/**
 * Content-based recommendations using embeddings.
 * Combines embedding similarity with rule-based filtering.
 */
export async function getSmartRecommendations(userId: string, limit: number = 10): Promise<ScoredProperty[]> {
  const start = Date.now()

  // Load user profile
  const profile = await TenantProfile.findOne({ userId }).lean()
  const credit = await CreditScore.findOne({ userId }).lean()

  // Build user preference embedding
  const userText = buildUserPreferenceText(profile)
  const { embedding: userEmbedding } = await embed(userText)

  // Load candidate properties (approved listings only)
  const filter: Record<string, unknown> = { listingStatus: 'approved' }
  const prefs = profile?.searchPreferences

  if (prefs && prefs.maxBudget != null && prefs.maxBudget > 0) {
    filter.rentAmount = { $lte: prefs.maxBudget }
  }
  if (prefs && prefs.preferredType?.length) {
    filter.type = { $in: prefs.preferredType }
  }
  if (prefs && prefs.minBedrooms != null && prefs.minBedrooms > 0) {
    filter.bedrooms = { $gte: prefs.minBedrooms }
  }
  if (prefs?.needsFurnished) {
    filter.furnished = true
  }

  const properties = await Property.find(filter).limit(200).lean()

  // Load user's interaction history
  const [favorites, applications] = await Promise.all([
    Favorite.find({ userId }).lean(),
    Application.find({ tenantId: userId }).lean(),
  ])
  const favoriteIds = new Set(favorites.map((f) => f.propertyId))
  // appliedIds reserved for future filtering
  void applications

  // Score each property
  const scored: ScoredProperty[] = []

  for (const p of properties) {
    const propertyPrefs = p.preferences

    // Hard filter: landlord preferences exclude this tenant
    if (propertyPrefs) {
      if (propertyPrefs.minCreditScore > 0 && (credit?.score ?? 0) < propertyPrefs.minCreditScore) continue
      if (!propertyPrefs.allowSmokers && profile?.smoker) continue
      if (!propertyPrefs.allowPets && profile?.pets) continue
      if (!propertyPrefs.allowChildren && profile?.hasChildren) continue
      if (propertyPrefs.requireProfileComplete && !profile?.profileComplete) continue
    }

    const matchReasons: string[] = []
    let score = 50 // base

    // 1. Embedding similarity (0-30 points)
    const propertyText = buildPropertyText(p)
    const { embedding: propertyEmbedding } = await embed(propertyText)
    const similarity = cosineSimilarity(userEmbedding, propertyEmbedding)
    const embeddingScore = Math.round(similarity * 30)
    score += embeddingScore
    if (embeddingScore > 20) matchReasons.push('Strong preference match')

    // 2. City match (0-15 points)
    if (prefs?.preferredCities?.some((c: string) => (p.address.city ?? '').toLowerCase().includes(c.toLowerCase()))) {
      score += 15
      matchReasons.push(`In preferred city: ${p.address.city}`)
    }

    // 3. Type match (0-10 points)
    if (prefs?.preferredType?.includes(p.type)) {
      score += 10
      matchReasons.push(`Matches preferred type: ${p.type}`)
    }

    // 4. Budget fit (0-10 points)
    if (prefs?.maxBudget && p.rentAmount <= prefs.maxBudget) {
      score += 10
      matchReasons.push('Within budget')
    }

    // 5. Amenities match (0-10 points)
    const amenityMatches = prefs?.preferredAmenities?.filter((a: string) => p.amenities?.includes(a)) ?? []
    if (amenityMatches.length > 0) {
      score += Math.min(10, amenityMatches.length * 3)
      matchReasons.push(`Has amenities you want: ${amenityMatches.join(', ')}`)
    }

    // 6. Interaction history boost
    if (favoriteIds.has((p._id as Types.ObjectId).toString())) {
      score += 5
      matchReasons.push('You favorited this')
    }

    // 7. New listing boost
    const createdAt = (p as { createdAt?: Date }).createdAt
    const daysSinceCreated = createdAt ? (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24) : Infinity
    if (daysSinceCreated < 7) {
      score += 3
      matchReasons.push('New listing')
    }

    scored.push({
      id: (p._id as Types.ObjectId).toString(),
      title: p.title,
      type: p.type,
      rentAmount: p.rentAmount,
      address: p.address,
      bedrooms: p.bedrooms,
      bathrooms: p.bathrooms,
      furnished: p.furnished,
      amenities: p.amenities,
      images: p.images,
      matchScore: Math.min(100, score),
      matchReasons: matchReasons.length > 0 ? matchReasons : ['Recommended for you'],
    })
  }

  scored.sort((a, b) => b.matchScore - a.matchScore)
  const results = scored.slice(0, limit)

  logger.info(`[Recommendations] Generated ${results.length} recommendations in ${Date.now() - start}ms for user ${userId}`)
  return results
}

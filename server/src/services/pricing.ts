import { Property } from '../models/Property.js'
import { rentPriceModel } from './ml/pricingModel.js'
import type { PredictionResult } from './ml/pricingModel.js'
import { mlClient } from './mlClient.js'

// Escape user-supplied input before embedding it in a RegExp, to prevent
// catastrophic-backtracking ReDoS and regex injection (e.g. city = '.*').
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface ComparableProperty {
  id: string
  title: string
  rentAmount: number
  bedrooms: number
  bathrooms: number
  floorArea?: number
  furnished: boolean
  type: string
  city: string
  neighborhood?: string
  amenities: string[]
  images: string[]
  distance: number // 0 = exact match, higher = less comparable
}

export interface PricingAnalysis {
  suggestedRent: number
  marketMedian: number
  marketAverage: number
  marketMin: number
  marketMax: number
  comparableCount: number
  confidence: 'high' | 'medium' | 'low'
  factors: { factor: string; adjustment: number; direction: 'up' | 'down' | 'neutral' }[]
  comparableProperties: ComparableProperty[]
  mlPrediction?: PredictionResult
}

export interface RentTrend {
  month: string
  averageRent: number
  medianRent: number
  listingCount: number
}

const BASE_SIMILARITY = 100

function calcDistance(
  target: { type: string; bedrooms: number; bathrooms: number; city: string; furnished: boolean; amenities: string[] },
  prop: { type: string; bedrooms: number; bathrooms: number; address: { city: string }; furnished: boolean; amenities: string[] },
): number {
  let dist = 0
  if (target.type !== prop.type) dist += 30
  dist += Math.abs(target.bedrooms - prop.bedrooms) * 10
  dist += Math.abs(target.bathrooms - prop.bathrooms) * 5
  if (target.city.toLowerCase() !== prop.address.city.toLowerCase()) dist += 20
  if (target.furnished !== prop.furnished) dist += 8
  const amenityOverlap = target.amenities.filter(a => prop.amenities.some(pa => pa.toLowerCase() === a.toLowerCase())).length
  const amenityDiff = Math.max(0, target.amenities.length - amenityOverlap)
  dist += amenityDiff * 3
  return dist
}

export async function analyzePropertyPricing(
  city: string,
  type: string,
  bedrooms: number,
  bathrooms = 1,
  furnished = false,
  amenities: string[] = [],
  floorArea?: number,
  excludePropertyId?: string,
): Promise<PricingAnalysis> {
  // Find properties in same city, similar type
  const query: Record<string, unknown> = {
    'address.city': { $regex: new RegExp(`^${escapeRegex(city)}$`, 'i') },
    status: 'available',
    listingStatus: 'approved',
    rentAmount: { $gt: 0 },
  }
  if (excludePropertyId) {
    query._id = { $ne: excludePropertyId }
  }

  const candidates = await Property.find(query).lean()

  // Score by similarity and sort
  const scored = candidates.map(prop => ({
    prop,
    dist: calcDistance(
      { type, bedrooms, bathrooms, city, furnished, amenities },
      {
        type: prop.type as string,
        bedrooms: prop.bedrooms as number,
        bathrooms: prop.bathrooms as number,
        address: prop.address as { city: string },
        furnished: prop.furnished as boolean,
        amenities: (prop.amenities as string[]) ?? [],
      },
    ),
  }))

  scored.sort((a, b) => a.dist - b.dist)

  // Take top 20 comparables within reasonable distance
  const topComparables = scored.filter(s => s.dist <= BASE_SIMILARITY).slice(0, 20)
  const comparableProperties: ComparableProperty[] = topComparables.map(s => ({
    id: String(s.prop._id),
    title: String(s.prop.title),
    rentAmount: Number(s.prop.rentAmount),
    bedrooms: Number(s.prop.bedrooms),
    bathrooms: Number(s.prop.bathrooms),
    floorArea: s.prop.floorArea as number | undefined,
    furnished: Boolean(s.prop.furnished),
    type: String(s.prop.type),
    city: String(s.prop.address?.city),
    neighborhood: (s.prop.address as { neighborhood?: string })?.neighborhood,
    amenities: (s.prop.amenities as string[]) ?? [],
    images: (s.prop.images as string[]) ?? [],
    distance: s.dist,
  }))

  const rents = comparableProperties.map(p => p.rentAmount)
  const marketMedian = rents.length ? median(rents) : 0
  const marketAverage = rents.length ? rents.reduce((a, b) => a + b, 0) / rents.length : 0
  const marketMin = rents.length ? Math.min(...rents) : 0
  const marketMax = rents.length ? Math.max(...rents) : 0

  // Calculate adjustments
  const factors: PricingAnalysis['factors'] = []

  // Base price from median
  let suggestedRent = marketMedian || marketAverage || 0

  // Amenities adjustment
  if (amenities.length > 0) {
    const amenityPremium = amenities.length * (suggestedRent * 0.015)
    suggestedRent += amenityPremium
    factors.push({ factor: `${amenities.length} amenities`, adjustment: Math.round(amenityPremium), direction: 'up' })
  }

  // Furnished premium
  if (furnished) {
    const furnishedPremium = suggestedRent * 0.08
    suggestedRent += furnishedPremium
    factors.push({ factor: 'Furnished', adjustment: Math.round(furnishedPremium), direction: 'up' })
  }

  // Floor area adjustment (if we have data)
  if (floorArea && floorArea > 0) {
    const avgArea = comparableProperties.filter(p => p.floorArea).reduce((sum, p, _, arr) => sum + (p.floorArea ?? 0) / arr.length, 0)
    if (avgArea > 0) {
      const areaDiff = floorArea - avgArea
      const areaAdjustment = (areaDiff / avgArea) * suggestedRent * 0.15
      suggestedRent += areaAdjustment
      factors.push({
        factor: `Floor area (${floorArea} vs avg ${Math.round(avgArea)} sqm)`,
        adjustment: Math.round(Math.abs(areaAdjustment)),
        direction: areaAdjustment >= 0 ? 'up' : 'down',
      })
    }
  }

  // City tier adjustment (basic)
  const cityLower = city.toLowerCase()
  if (['accra', 'tema', 'east legon', 'airport residential', 'cantonments'].some(c => cityLower.includes(c))) {
    // Already priced in by comparables
    factors.push({ factor: 'Premium location', adjustment: 0, direction: 'neutral' })
  }

  suggestedRent = Math.round(suggestedRent)

  let confidence: PricingAnalysis['confidence'] = 'low'
  if (rents.length >= 10 && comparableProperties.filter(p => p.distance < 30).length >= 3) confidence = 'high'
  else if (rents.length >= 5) confidence = 'medium'

  // Add ML prediction if model is trained (local or external)
  let mlPrediction: PredictionResult | undefined
  const mlInput = { city, type, bedrooms, bathrooms, floorArea, furnished, amenities }
  try {
    if (mlClient.isEnabled()) {
      try {
        mlPrediction = await mlClient.predict(mlInput)
      } catch {
        // External ML service down/slow — fall back to the local model if trained.
        if (rentPriceModel.isTrained) mlPrediction = rentPriceModel.predict(mlInput)
      }
    } else if (rentPriceModel.isTrained) {
      mlPrediction = rentPriceModel.predict(mlInput)
    }
  } catch {
    // ML prediction optional — don't fail the whole analysis
  }

  return {
    suggestedRent,
    marketMedian: Math.round(marketMedian),
    marketAverage: Math.round(marketAverage),
    marketMin,
    marketMax,
    comparableCount: rents.length,
    confidence,
    factors,
    comparableProperties,
    mlPrediction,
  }
}

export async function getRentTrends(
  city: string,
  type?: string,
  bedrooms?: number,
  months = 6,
): Promise<RentTrend[]> {
  const results: RentTrend[] = []
  const now = new Date()

  for (let i = months - 1; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)
    const label = monthDate.toLocaleString('en-US', { month: 'short', year: 'numeric' })

    const query: Record<string, unknown> = {
      'address.city': { $regex: new RegExp(`^${escapeRegex(city)}$`, 'i') },
      listingStatus: 'approved',
      rentAmount: { $gt: 0 },
      createdAt: { $lte: monthEnd },
    }
    if (type) query.type = type
    if (bedrooms !== undefined) query.bedrooms = bedrooms

    const props = await Property.find(query).select('rentAmount').lean()
    const rents = props.map(p => Number(p.rentAmount))

    results.push({
      month: label,
      averageRent: rents.length ? Math.round(rents.reduce((a, b) => a + b, 0) / rents.length) : 0,
      medianRent: rents.length ? Math.round(median(rents)) : 0,
      listingCount: rents.length,
    })
  }

  return results
}

export interface FairPriceResult {
  isFair: boolean
  verdict: string
  suggestedRange: { min: number; max: number }
  comparableCount: number
  factors: { factor: string; impact: string }[]
}

export async function checkFairPrice(
  price: number,
  city: string,
  type: string,
  bedrooms: number,
  bathrooms = 1,
  furnished = false,
  amenities: string[] = [],
  floorArea?: number,
): Promise<FairPriceResult> {
  const analysis = await analyzePropertyPricing(city, type, bedrooms, bathrooms, furnished, amenities, floorArea)

  const minFair = Math.round(analysis.marketMedian * 0.75)
  const maxFair = Math.round(analysis.marketMedian * 1.35)
  const isFair = price >= minFair && price <= maxFair

  const factors: FairPriceResult['factors'] = []

  if (price > analysis.marketMedian * 1.2) {
    factors.push({ factor: 'Price above market median', impact: 'This listing is priced higher than comparable properties' })
  } else if (price < analysis.marketMedian * 0.8) {
    factors.push({ factor: 'Price below market median', impact: 'This listing is priced lower than comparable properties — check for issues' })
  } else {
    factors.push({ factor: 'Price aligned with market', impact: 'This price is in line with similar properties' })
  }

  if (furnished && price < analysis.marketMedian) {
    factors.push({ factor: 'Furnished but underpriced', impact: 'Furnished properties typically command a premium' })
  }

  if (amenities.length >= 5 && price < analysis.marketMedian * 0.9) {
    factors.push({ factor: 'Many amenities, low price', impact: 'Many amenities usually justify higher rent' })
  }

  let verdict: string
  if (isFair) verdict = 'This price appears fair for the area and property type.'
  else if (price > maxFair) verdict = 'This price is above the typical market range. Consider negotiating or looking for alternatives.'
  else verdict = 'This price is below the typical market range. Verify property details carefully.'

  return {
    isFair,
    verdict,
    suggestedRange: { min: minFair, max: maxFair },
    comparableCount: analysis.comparableCount,
    factors,
  }
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

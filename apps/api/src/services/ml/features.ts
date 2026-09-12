import type { IProperty } from '../../models/Property.js'

export const FEATURE_NAMES = [
  'bedrooms',
  'bathrooms',
  'floorArea',
  'furnished',
  'parkingSpaces',
  'advanceMonths',
  'amenitiesCount',
  'cityEncoded',
  'typeEncoded',
  'regionEncoded',
  'hasWater',
  'hasElectricity',
  'hasSecurity',
  'hasWifi',
  'hasAc',
  'floor',
  'yearBuilt',
  'stayTypeShort',
] as const

export type FeatureVector = number[]

/**
 * "The caller did not tell us", as distinct from a real zero.
 *
 * The model imputes these with the training mean of the column (see
 * pricingModel.predict). Imputing 0 instead reads "unknown year built" as
 * "built in year 0" and "a city we have never seen" as "a city where rent is
 * GHS 0" — and since this is a linear model, that is a confident, badly low
 * price rather than an error. analyzePropertyPricing sends 7 of the 13
 * fields, and was getting an estimate ~39% under the same property described
 * in full.
 */
export const MISSING = NaN

/** A supplied 0 means zero; an absent field means unknown. */
function num(value: unknown): number {
  if (value === undefined || value === null || value === '') return MISSING
  const n = Number(value)
  return Number.isFinite(n) ? n : MISSING
}

export interface Encodings {
  city: Record<string, number>
  type: Record<string, number>
  region: Record<string, number>
}

function hasKeyword(list: string[] | undefined, keywords: string[]): boolean {
  if (!list || list.length === 0) return false
  const lower = list.map(s => s.toLowerCase())
  return keywords.some(k => lower.some(s => s.includes(k)))
}

export function computeEncodings(properties: IProperty[]): Encodings {
  const citySums: Record<string, { sum: number; count: number }> = {}
  const typeSums: Record<string, { sum: number; count: number }> = {}
  const regionSums: Record<string, { sum: number; count: number }> = {}

  for (const p of properties) {
    const rent = Number(p.rentAmount)
    if (!rent || rent <= 0) continue

    const city = String(p.address?.city || '').toLowerCase().trim()
    const type = String(p.type || '').toLowerCase().trim()
    const region = String(p.address?.region || '').toLowerCase().trim()

    if (city) {
      citySums[city] = citySums[city] || { sum: 0, count: 0 }
      citySums[city].sum += rent
      citySums[city].count++
    }
    if (type) {
      typeSums[type] = typeSums[type] || { sum: 0, count: 0 }
      typeSums[type].sum += rent
      typeSums[type].count++
    }
    if (region) {
      regionSums[region] = regionSums[region] || { sum: 0, count: 0 }
      regionSums[region].sum += rent
      regionSums[region].count++
    }
  }

  const globalMean = properties.length > 0
    ? properties.reduce((s, p) => s + (Number(p.rentAmount) || 0), 0) / properties.length
    : 0

  const toMeans = (sums: Record<string, { sum: number; count: number }>) => {
    const means: Record<string, number> = {}
    for (const [key, val] of Object.entries(sums)) {
      means[key] = val.count > 0 ? val.sum / val.count : globalMean
    }
    return means
  }

  return {
    city: toMeans(citySums),
    type: toMeans(typeSums),
    region: toMeans(regionSums),
  }
}

export interface PropertyInput {
  bedrooms: number
  bathrooms: number
  floorArea?: number
  furnished?: boolean
  parkingSpaces?: number
  advanceMonths?: number
  amenities?: string[]
  city: string
  type: string
  region?: string
  floor?: number
  yearBuilt?: number
  stayType?: 'short_stay' | 'long_stay'
}

export function extractFeatures(input: PropertyInput, encodings: Encodings): FeatureVector {
  const cityKey = input.city.toLowerCase().trim()
  const typeKey = input.type.toLowerCase().trim()
  const regionKey = (input.region || '').toLowerCase().trim()

  const amenities = input.amenities || []

  return [
    num(input.bedrooms),
    num(input.bathrooms),
    num(input.floorArea),
    input.furnished ? 1 : 0,
    num(input.parkingSpaces),
    num(input.advanceMonths),
    amenities.length, // an empty/absent list means no amenities, not unknown
    // A city/type/region never seen in training is unknown, not worthless:
    // these are target-mean encodings in the thousands of GHS.
    encodings.city[cityKey] ?? MISSING,
    encodings.type[typeKey] ?? MISSING,
    encodings.region[regionKey] ?? MISSING,
    hasKeyword(amenities, ['water']) ? 1 : 0,
    hasKeyword(amenities, ['electric', 'power']) ? 1 : 0,
    hasKeyword(amenities, ['security', 'guard', 'cctv']) ? 1 : 0,
    hasKeyword(amenities, ['wifi', 'internet']) ? 1 : 0,
    hasKeyword(amenities, ['ac', 'air condition', 'aircond']) ? 1 : 0,
    num(input.floor),
    num(input.yearBuilt),
    input.stayType === 'short_stay' ? 1 : 0,
  ]
}

export function extractFeaturesFromProperty(property: IProperty, encodings: Encodings): FeatureVector {
  return extractFeatures({
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    floorArea: property.floorArea,
    furnished: property.furnished,
    parkingSpaces: property.parkingSpaces,
    advanceMonths: property.advanceMonths,
    amenities: property.amenities,
    city: property.address?.city || '',
    type: property.type,
    region: property.address?.region,
    floor: property.floor,
    yearBuilt: property.yearBuilt,
    stayType: property.stayType,
  }, encodings)
}

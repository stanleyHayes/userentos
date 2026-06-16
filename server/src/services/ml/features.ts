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
    Number(input.bedrooms) || 0,
    Number(input.bathrooms) || 0,
    Number(input.floorArea) || 0,
    input.furnished ? 1 : 0,
    Number(input.parkingSpaces) || 0,
    Number(input.advanceMonths) || 0,
    amenities.length,
    encodings.city[cityKey] ?? 0,
    encodings.type[typeKey] ?? 0,
    encodings.region[regionKey] ?? 0,
    hasKeyword(amenities, ['water']) ? 1 : 0,
    hasKeyword(amenities, ['electric', 'power']) ? 1 : 0,
    hasKeyword(amenities, ['security', 'guard', 'cctv']) ? 1 : 0,
    hasKeyword(amenities, ['wifi', 'internet']) ? 1 : 0,
    hasKeyword(amenities, ['ac', 'air condition', 'aircond']) ? 1 : 0,
    Number(input.floor) || 0,
    Number(input.yearBuilt) || 0,
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

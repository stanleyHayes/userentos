import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// Replicate the nearby query schema to test validation edge cases
const nearbySchema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  radiusKm: z.coerce.number().default(5),
  type: z.string().optional(),
  maxRent: z.coerce.number().optional(),
})

describe('geospatial /properties/nearby query validation', () => {
  it('accepts valid coordinates', () => {
    const result = nearbySchema.safeParse({ lat: '5.6037', lng: '-0.1870', radiusKm: '10' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.lat).toBe(5.6037)
      expect(result.data.lng).toBe(-0.1870)
      expect(result.data.radiusKm).toBe(10)
    }
  })

  it('rejects non-numeric lat', () => {
    const result = nearbySchema.safeParse({ lat: 'abc', lng: '-0.1870' })
    expect(result.success).toBe(false)
  })

  it('rejects non-numeric lng', () => {
    const result = nearbySchema.safeParse({ lat: '5.6037', lng: 'xyz' })
    expect(result.success).toBe(false)
  })

  it('rejects non-numeric radiusKm', () => {
    const result = nearbySchema.safeParse({ lat: '5.6037', lng: '-0.1870', radiusKm: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('applies default radiusKm of 5', () => {
    const result = nearbySchema.safeParse({ lat: '5.6037', lng: '-0.1870' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.radiusKm).toBe(5)
    }
  })

  it('accepts optional type and maxRent', () => {
    const result = nearbySchema.safeParse({
      lat: '5.6037',
      lng: '-0.1870',
      radiusKm: '3',
      type: 'apartment',
      maxRent: '5000',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.type).toBe('apartment')
      expect(result.data.maxRent).toBe(5000)
    }
  })
})

describe('geospatial haversine distance', () => {
  function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180
    const R = 6371
    const dLat = toRad(lat2 - lat1)
    const dLng = toRad(lng2 - lng1)
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100
  }

  it('returns ~0 for same point', () => {
    expect(haversine(5.6037, -0.187, 5.6037, -0.187)).toBe(0)
  })

  it('computes Accra to Tema distance (~24 km)', () => {
    // Accra: ~5.6037, -0.1870 | Tema: ~5.6698, -0.0166
    const distance = haversine(5.6037, -0.187, 5.6698, -0.0166)
    expect(distance).toBeGreaterThan(20)
    expect(distance).toBeLessThan(30)
  })

  it('is symmetric', () => {
    const d1 = haversine(5.6037, -0.187, 6.0, -0.5)
    const d2 = haversine(6.0, -0.5, 5.6037, -0.187)
    expect(d1).toBe(d2)
  })
})

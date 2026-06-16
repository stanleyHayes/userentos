import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../models/Property.js', () => ({
  Property: {
    find: vi.fn(() => ({ lean: vi.fn() })),
    findById: vi.fn(),
    countDocuments: vi.fn(),
    distinct: vi.fn(),
  },
}))

import { Property } from '../models/Property.js'
import { analyzePropertyPricing, getRentTrends, checkFairPrice } from '../services/pricing.js'

const mockLean = vi.fn()
const mockSelect = vi.fn(() => ({ lean: mockLean }))
const findChain = { lean: mockLean, select: mockSelect }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(Property.find).mockReturnValue(findChain as unknown as ReturnType<typeof Property.find>)
})

describe('Pricing Engine', () => {
  describe('analyzePropertyPricing', () => {
    it('returns analysis with comparables', async () => {
      mockLean.mockResolvedValue([
        { _id: '1', title: 'A', rentAmount: 2000, bedrooms: 2, bathrooms: 1, type: 'apartment', address: { city: 'Accra' }, furnished: false, amenities: [], images: [] },
        { _id: '2', title: 'B', rentAmount: 2500, bedrooms: 2, bathrooms: 1, type: 'apartment', address: { city: 'Accra' }, furnished: false, amenities: [], images: [] },
        { _id: '3', title: 'C', rentAmount: 3000, bedrooms: 3, bathrooms: 2, type: 'house', address: { city: 'Accra' }, furnished: true, amenities: ['WiFi'], images: [] },
      ])

      const result = await analyzePropertyPricing('Accra', 'apartment', 2, 1, false, [])

      expect(result.comparableCount).toBe(3)
      expect(result.marketMedian).toBe(2500)
      expect(result.marketAverage).toBe(2500)
      expect(result.marketMin).toBe(2000)
      expect(result.marketMax).toBe(3000)
      expect(result.suggestedRent).toBeGreaterThan(0)
      expect(result.comparableProperties.length).toBeGreaterThan(0)
      expect(result.confidence).toBe('low')
    })

    it('returns low confidence when no comparables found', async () => {
      mockLean.mockResolvedValue([])

      const result = await analyzePropertyPricing('Kumasi', 'castle', 10)

      expect(result.comparableCount).toBe(0)
      expect(result.marketMedian).toBe(0)
      expect(result.confidence).toBe('low')
      expect(result.suggestedRent).toBe(0)
    })

    it('adjusts for furnished premium', async () => {
      mockLean.mockResolvedValue([
        { _id: '1', title: 'A', rentAmount: 2000, bedrooms: 2, bathrooms: 1, type: 'apartment', address: { city: 'Accra' }, furnished: false, amenities: [], images: [] },
      ])

      const result = await analyzePropertyPricing('Accra', 'apartment', 2, 1, true, [])

      expect(result.factors.some(f => f.factor === 'Furnished')).toBe(true)
      expect(result.suggestedRent).toBeGreaterThan(2000)
    })
  })

  describe('getRentTrends', () => {
    it('returns trends for each month', async () => {
      mockLean.mockResolvedValue([
        { rentAmount: 2000 },
        { rentAmount: 2500 },
      ])

      const result = await getRentTrends('Accra', 'apartment', 2, 3)

      expect(result.length).toBe(3)
      expect(result[0].month).toBeDefined()
      expect(result[0].averageRent).toBe(2250)
      expect(result[0].medianRent).toBe(2250)
      expect(result[0].listingCount).toBe(2)
    })

    it('handles empty results gracefully', async () => {
      mockLean.mockResolvedValue([])

      const result = await getRentTrends('Tema', undefined, undefined, 3)

      expect(result.length).toBe(3)
      expect(result.every(r => r.averageRent === 0)).toBe(true)
      expect(result.every(r => r.listingCount === 0)).toBe(true)
    })
  })

  describe('checkFairPrice', () => {
    it('marks fair price within range', async () => {
      mockLean.mockResolvedValue([
        { _id: '1', title: 'A', rentAmount: 2000, bedrooms: 2, bathrooms: 1, type: 'apartment', address: { city: 'Accra' }, furnished: false, amenities: [], images: [] },
        { _id: '2', title: 'B', rentAmount: 2500, bedrooms: 2, bathrooms: 1, type: 'apartment', address: { city: 'Accra' }, furnished: false, amenities: [], images: [] },
      ])

      const result = await checkFairPrice(2200, 'Accra', 'apartment', 2)

      expect(result.isFair).toBe(true)
      expect(result.verdict).toContain('fair')
      expect(result.comparableCount).toBe(2)
    })

    it('flags excessive price', async () => {
      mockLean.mockResolvedValue([
        { _id: '1', title: 'A', rentAmount: 2000, bedrooms: 2, bathrooms: 1, type: 'apartment', address: { city: 'Accra' }, furnished: false, amenities: [], images: [] },
      ])

      const result = await checkFairPrice(5000, 'Accra', 'apartment', 2)

      expect(result.isFair).toBe(false)
      expect(result.verdict.toLowerCase()).toContain('above')
    })
  })
})

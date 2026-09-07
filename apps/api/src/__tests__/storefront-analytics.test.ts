import { describe, it, expect, vi } from 'vitest'

vi.mock('../models/Storefront.js', () => ({ Storefront: { findOne: vi.fn() } }))
vi.mock('../models/StorefrontDomain.js', () => ({ StorefrontDomain: { findOne: vi.fn(), find: vi.fn() } }))
vi.mock('../models/StorefrontEvent.js', () => ({ StorefrontEvent: { aggregate: vi.fn(), create: vi.fn() } }))
vi.mock('../models/Property.js', () => ({ Property: { find: vi.fn() } }))
vi.mock('../models/BlogPost.js', () => ({ BlogPost: { find: vi.fn() } }))

const {
  clampAnalyticsDays, analyticsWindow, percentChange, countsByType, buildDailySeries,
} = await import('../routes/storefronts.js')

describe('clampAnalyticsDays', () => {
  it('defaults to 30 days when the caller says nothing', () => {
    expect(clampAnalyticsDays(undefined)).toBe(30)
    expect(clampAnalyticsDays('')).toBe(30)
    expect(clampAnalyticsDays('   ')).toBe(30)
  })

  it('falls back to the default rather than erroring on junk', () => {
    expect(clampAnalyticsDays('thirty')).toBe(30)
    expect(clampAnalyticsDays('-7')).toBe(30)
    expect(clampAnalyticsDays('0')).toBe(30)
    expect(clampAnalyticsDays({})).toBe(30)
    expect(clampAnalyticsDays(Infinity)).toBe(30)
  })

  it('caps the range so one request cannot scan the whole collection', () => {
    expect(clampAnalyticsDays('90')).toBe(90)
    expect(clampAnalyticsDays('91')).toBe(90)
    expect(clampAnalyticsDays('100000')).toBe(90)
  })

  it('accepts real ranges and floors fractions to whole days', () => {
    expect(clampAnalyticsDays('7')).toBe(7)
    expect(clampAnalyticsDays(14)).toBe(14)
    expect(clampAnalyticsDays('7.9')).toBe(7)
    expect(clampAnalyticsDays('0.4')).toBe(1)
  })

  it('reads the first value when Express hands over a repeated query param', () => {
    expect(clampAnalyticsDays(['7', '90'])).toBe(7)
  })
})

describe('analyticsWindow', () => {
  const now = new Date('2026-09-07T14:30:00.000Z')

  it('starts the range at midnight UTC so the first bucket is a whole day', () => {
    const { from } = analyticsWindow(30, now)
    expect(from.toISOString()).toBe('2026-08-09T00:00:00.000Z')
  })

  it('counts today as one of the days in the range', () => {
    const { from, to } = analyticsWindow(1, now)
    expect(from.toISOString()).toBe('2026-09-07T00:00:00.000Z')
    expect(to).toBe(now)
  })

  it('puts the previous window immediately before, at the same length', () => {
    const { from, previousFrom, days } = analyticsWindow(30, now)
    expect(previousFrom.toISOString()).toBe('2026-07-10T00:00:00.000Z')
    expect(from.getTime() - previousFrom.getTime()).toBe(days * 24 * 60 * 60 * 1000)
  })
})

describe('percentChange', () => {
  it('reports no change when nothing happened in either window', () => {
    expect(percentChange(0, 0)).toBe(0)
  })

  it('refuses to invent a percentage against a zero baseline', () => {
    expect(percentChange(12, 0)).toBeNull()
    expect(percentChange(1, 0)).toBeNull()
  })

  it('reports growth and decline against a real baseline', () => {
    expect(percentChange(150, 100)).toBe(50)
    expect(percentChange(50, 100)).toBe(-50)
    expect(percentChange(0, 40)).toBe(-100)
  })

  it('rounds to one decimal place', () => {
    expect(percentChange(4, 3)).toBe(33.3)
    expect(percentChange(2, 3)).toBe(-33.3)
  })
})

describe('countsByType', () => {
  it('zeroes every counter for an empty window', () => {
    expect(countsByType([])).toEqual({ views: 0, listingImpressions: 0, contactClicks: 0 })
  })

  it('sums repeated rows for the same type and ignores unknown ones', () => {
    expect(countsByType([
      { type: 'view', count: 4 },
      { type: 'view', count: 2 },
      { type: 'listing_impression', count: 9 },
      { type: 'contact_click', count: 3 },
      { type: 'something_new', count: 99 },
    ])).toEqual({ views: 6, listingImpressions: 9, contactClicks: 3 })
  })
})

describe('buildDailySeries', () => {
  const from = new Date('2026-09-05T00:00:00.000Z')

  it('returns one zero-filled bucket per day, in order', () => {
    const series = buildDailySeries(from, 3, [], [])

    expect(series.map((b) => b.date)).toEqual(['2026-09-05', '2026-09-06', '2026-09-07'])
    expect(series[0]).toEqual({
      date: '2026-09-05', views: 0, uniqueVisitors: 0, listingImpressions: 0, contactClicks: 0,
    })
  })

  it('keeps the days that had no events instead of closing the gaps up', () => {
    const series = buildDailySeries(from, 3, [{ date: '2026-09-07', type: 'view', count: 5 }], [])

    expect(series).toHaveLength(3)
    expect(series.map((b) => b.views)).toEqual([0, 0, 5])
  })

  it('lands each event type in its own counter', () => {
    const series = buildDailySeries(from, 2, [
      { date: '2026-09-05', type: 'view', count: 3 },
      { date: '2026-09-05', type: 'listing_impression', count: 8 },
      { date: '2026-09-06', type: 'contact_click', count: 2 },
    ], [])

    expect(series[0]).toMatchObject({ views: 3, listingImpressions: 8, contactClicks: 0 })
    expect(series[1]).toMatchObject({ views: 0, listingImpressions: 0, contactClicks: 2 })
  })

  it('applies unique visitors from their own aggregation', () => {
    const series = buildDailySeries(from, 2, [{ date: '2026-09-05', type: 'view', count: 9 }], [
      { date: '2026-09-05', visitors: 4 },
    ])

    expect(series[0].uniqueVisitors).toBe(4)
    expect(series[1].uniqueVisitors).toBe(0)
  })

  it('drops rows outside the range rather than misattributing them', () => {
    const series = buildDailySeries(from, 2, [
      { date: '2026-09-04', type: 'view', count: 100 },
      { date: '2026-12-01', type: 'view', count: 100 },
    ], [{ date: '2026-09-04', visitors: 50 }])

    expect(series.map((b) => b.views)).toEqual([0, 0])
    expect(series.map((b) => b.uniqueVisitors)).toEqual([0, 0])
  })

  it('normalizes a mid-day range start onto that day\'s bucket', () => {
    const series = buildDailySeries(new Date('2026-09-05T18:45:00.000Z'), 2, [], [])
    expect(series.map((b) => b.date)).toEqual(['2026-09-05', '2026-09-06'])
  })
})

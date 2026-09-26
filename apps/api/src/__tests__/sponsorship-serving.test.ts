import { describe, it, expect, expectTypeOf, vi, beforeEach } from 'vitest'
import { Sponsorship } from '../models/Sponsorship.js'
import { Property } from '../models/Property.js'
import * as serving from '../services/marketplace/sponsorshipServing.js'
import {
  getSponsoredPlacements, applySponsoredPlacements, expireFinishedCampaigns, recordImpressions,
  type SponsoredPlacementName,
} from '../services/marketplace/sponsorshipServing.js'

vi.mock('../models/Sponsorship.js', () => ({
  Sponsorship: { find: vi.fn(), updateMany: vi.fn(), updateOne: vi.fn() },
  SponsorshipProduct: {},
}))
vi.mock('../models/Property.js', () => ({ Property: { find: vi.fn() } }))

const sortCalls: unknown[] = []
const campaigns = (rows: unknown[]) =>
  vi.mocked(Sponsorship.find).mockReturnValue({
    select: () => ({
      sort: (order: unknown) => {
        sortCalls.push(order)
        return { lean: vi.fn().mockResolvedValue(rows) }
      },
    }),
  } as never)
const properties = (rows: unknown[]) =>
  vi.mocked(Property.find).mockReturnValue({ select: () => ({ lean: vi.fn().mockResolvedValue(rows) }) } as never)

/**
 * A Property.find stand-in that applies the id and city parts of the filter to
 * a fixture table, so a test can see what the serving query actually matches.
 */
const propertyTable = (table: { _id: string; city: string }[]) =>
  vi.mocked(Property.find).mockImplementation(((filter: Record<string, unknown>) => {
    const ids = (filter._id as { $in: string[] }).$in
    const city = filter['address.city'] as { $regex: string; $options: string } | undefined
    const rows = table.filter((p) => ids.includes(p._id) && (!city || new RegExp(city.$regex, city.$options).test(p.city)))
    return { select: () => ({ lean: vi.fn().mockResolvedValue(rows.map(({ _id }) => ({ _id }))) }) }
  }) as never)

describe('serving sponsored listings (spec §9)', () => {
  beforeEach(() => { vi.clearAllMocks(); sortCalls.length = 0 })

  it('serves an active campaign whose listing is still approved', async () => {
    campaigns([{ _id: 'camp-1', propertyId: 'prop-1', placement: 'search_top' }])
    properties([{ _id: 'prop-1' }])

    const placements = await getSponsoredPlacements('search_top')

    expect(placements).toEqual([{ propertyId: 'prop-1', sponsorshipId: 'camp-1', placement: 'search_top' }])
  })

  it('stops serving when the listing loses approval, without touching the campaign', async () => {
    campaigns([{ _id: 'camp-1', propertyId: 'prop-1', placement: 'search_top' }])
    properties([]) // the listing no longer matches approved/published

    expect(await getSponsoredPlacements('search_top')).toEqual([])
    // The billing record is untouched — nothing is deleted or rewritten.
    expect(Sponsorship.updateMany).not.toHaveBeenCalled()
    expect(Sponsorship.updateOne).not.toHaveBeenCalled()
  })

  it('only queries campaigns that are active and inside their window', async () => {
    campaigns([])
    properties([])
    await getSponsoredPlacements('search_top')

    const filter = vi.mocked(Sponsorship.find).mock.calls[0][0] as unknown as Record<string, unknown>
    expect(filter.status).toBe('active')
    expect(filter.placement).toBe('search_top')
    expect(filter).toHaveProperty('startAt')
    expect(filter).toHaveProperty('endAt')
  })

  it('requires the listing to be approved or published', async () => {
    campaigns([{ _id: 'c', propertyId: 'p', placement: 'search_top' }])
    properties([])
    await getSponsoredPlacements('search_top')

    const filter = vi.mocked(Property.find).mock.calls[0][0] as unknown as Record<string, unknown>
    expect(filter.listingStatus).toEqual({ $in: ['approved', 'published'] })
  })

  it('applies the city before choosing, so newer campaigns in the searched city still serve', async () => {
    // Twelve active campaigns; only the three newest are for Accra listings.
    // The old query kept the oldest nine and only then filtered by city, so
    // none of these three could ever be picked.
    const rows = Array.from({ length: 12 }, (_, i) => ({ _id: `camp-${i}`, propertyId: `prop-${i}`, placement: 'search_top' }))
    campaigns(rows)
    propertyTable(rows.map((r, i) => ({ _id: r.propertyId, city: i >= 9 ? 'Accra' : 'Kumasi' })))

    const placements = await getSponsoredPlacements('search_top', { city: 'accra' })

    expect(placements.map((p) => p.sponsorshipId)).toEqual(['camp-9', 'camp-10', 'camp-11'])
  })

  it('matches the city the way the organic search does: case-insensitive, regex-safe', async () => {
    campaigns([{ _id: 'c', propertyId: 'p', placement: 'search_top' }])
    properties([])
    await getSponsoredPlacements('search_top', { city: 'East Legon (Accra)' })

    const filter = vi.mocked(Property.find).mock.calls[0][0] as unknown as Record<string, unknown>
    expect(filter['address.city']).toEqual({ $regex: 'East Legon \\(Accra\\)', $options: 'i' })
  })

  it('rotates fairly: least-shown campaigns first, capped at the limit', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ _id: `camp-${i}`, propertyId: `prop-${i}`, placement: 'search_top' }))
    campaigns(rows)
    properties(rows.map((r) => ({ _id: r.propertyId })))

    const placements = await getSponsoredPlacements('search_top')

    expect(sortCalls[0]).toEqual({ 'metrics.impressions': 1, createdAt: 1 })
    expect(placements.map((p) => p.sponsorshipId)).toEqual(['camp-0', 'camp-1', 'camp-2'])
  })

  it('hoists a sponsored listing and labels it', () => {
    const organic = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const merged = applySponsoredPlacements(organic, [
      { propertyId: 'c', sponsorshipId: 'camp-9', placement: 'search_top' },
    ])

    expect(merged[0].id).toBe('c')
    expect(merged[0].sponsored).toBe(true)
    expect(merged[0].sponsorshipId).toBe('camp-9')
    // The label always travels with the boost, so a caller cannot render one
    // without the other.
    expect(merged.filter((m) => m.sponsored).length).toBe(1)
  })

  it('never duplicates a listing that is already in the organic results', () => {
    const organic = [{ id: 'a' }, { id: 'b' }]
    const merged = applySponsoredPlacements(organic, [
      { propertyId: 'a', sponsorshipId: 'camp-1', placement: 'search_top' },
    ])

    expect(merged).toHaveLength(2)
    expect(merged.map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('leaves results untouched when nothing is sponsored', () => {
    const organic = [{ id: 'a' }, { id: 'b' }]
    expect(applySponsoredPlacements(organic, [])).toBe(organic)
  })

  it('expires a finished campaign by status, preserving the record', async () => {
    vi.mocked(Sponsorship.updateMany).mockResolvedValue({ modifiedCount: 2 } as never)

    expect(await expireFinishedCampaigns()).toBe(2)

    const [filter, update] = vi.mocked(Sponsorship.updateMany).mock.calls[0]
    expect((filter as unknown as Record<string, unknown>).status).toBe('active')
    expect(update).toEqual({ $set: { status: 'expired' } })
  })
})

/*
 * The store answers (Apple: no Third-Party Advertising / Developer Advertising
 * purpose, no tracking; Google: no "Advertising or marketing" purpose) hold
 * only while choosing and counting sponsored items takes nothing about the
 * viewer. These pin that. Adding a user, device, IP or profile input here is a
 * store-declaration and privacy-policy change, not a refactor.
 */
describe('sponsored serving takes no viewer identifiers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('chooses placements from the placement, the request city and the listings on the page only', () => {
    // onPage is the organic result ids for this request, not anything about the viewer.
    expectTypeOf(getSponsoredPlacements).parameters.toEqualTypeOf<[SponsoredPlacementName, ({ city?: string; limit?: number; onPage?: string[] } | undefined)?]>()
    // Runtime arity too, in case the types are loosened with a cast.
    expect(getSponsoredPlacements.length).toBe(1)
  })

  it('counts impressions from campaign ids only, as one aggregate $inc', () => {
    expectTypeOf(recordImpressions).parameters.toEqualTypeOf<[string[]]>()
    vi.mocked(Sponsorship.updateMany).mockResolvedValue({ modifiedCount: 2 } as never)

    recordImpressions(['camp-1', 'camp-2'])

    expect(Sponsorship.updateMany).toHaveBeenCalledTimes(1)
    expect(vi.mocked(Sponsorship.updateMany).mock.calls[0]).toEqual([
      { _id: { $in: ['camp-1', 'camp-2'] } },
      { $inc: { 'metrics.impressions': 1 } },
    ])
  })

  it('has no click recorder to feed with per-viewer events', () => {
    expect(serving).not.toHaveProperty('recordClick')
  })

  it('reads nothing but campaign fields when choosing', async () => {
    campaigns([{ _id: 'c', propertyId: 'p', placement: 'search_top' }])
    properties([{ _id: 'p' }])
    await getSponsoredPlacements('search_top', { city: 'Accra' })

    const campaignFilter = vi.mocked(Sponsorship.find).mock.calls[0][0] as unknown as Record<string, unknown>
    const listingFilter = vi.mocked(Property.find).mock.calls[0][0] as unknown as Record<string, unknown>
    expect(Object.keys(campaignFilter).sort()).toEqual(['endAt', 'placement', 'startAt', 'status'])
    expect(Object.keys(listingFilter).sort()).toEqual(['_id', 'address.city', 'isActive', 'listingStatus'])
  })
})

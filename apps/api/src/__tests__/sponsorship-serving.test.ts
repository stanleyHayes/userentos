import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Sponsorship } from '../models/Sponsorship.js'
import { Property } from '../models/Property.js'
import {
  getSponsoredPlacements, applySponsoredPlacements, expireFinishedCampaigns,
} from '../services/marketplace/sponsorshipServing.js'

vi.mock('../models/Sponsorship.js', () => ({
  Sponsorship: { find: vi.fn(), updateMany: vi.fn(), updateOne: vi.fn() },
  SponsorshipProduct: {},
}))
vi.mock('../models/Property.js', () => ({ Property: { find: vi.fn() } }))

const campaigns = (rows: unknown[]) =>
  vi.mocked(Sponsorship.find).mockReturnValue({
    sort: () => ({ limit: () => ({ lean: vi.fn().mockResolvedValue(rows) }) }),
  } as never)
const properties = (rows: unknown[]) =>
  vi.mocked(Property.find).mockReturnValue({ select: () => ({ lean: vi.fn().mockResolvedValue(rows) }) } as never)

describe('serving sponsored listings (spec §9)', () => {
  beforeEach(() => vi.clearAllMocks())

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
    await getSponsoredPlacements('homepage')

    const filter = vi.mocked(Sponsorship.find).mock.calls[0][0] as unknown as Record<string, unknown>
    expect(filter.status).toBe('active')
    expect(filter.placement).toBe('homepage')
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

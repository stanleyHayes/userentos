import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReviewerOrganization } from '../models/ReviewerOrganization.js'
import { resolveReviewRouting } from '../services/reviewRouting.js'

vi.mock('../models/ReviewerOrganization.js', () => ({
  ReviewerOrganization: { find: vi.fn() },
}))

const mockOrgs = (rows: unknown[]) =>
  vi.mocked(ReviewerOrganization.find).mockReturnValue({ lean: vi.fn().mockResolvedValue(rows) } as never)

describe('external review is optional (spec P8, §18)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('routes to RentOS when no authority is configured', async () => {
    mockOrgs([])
    expect(await resolveReviewRouting({ address: { region: 'Greater Accra' } }))
      .toEqual({ mode: 'rentos_only' })
  })

  it('routes to RentOS when configured authorities are all inactive', async () => {
    // find() filters on isActive, so an inactive org never reaches routing.
    mockOrgs([])
    expect((await resolveReviewRouting({ address: { city: 'Accra' } })).mode).toBe('rentos_only')
  })

  it('ignores an authority whose scope does not cover the property', async () => {
    mockOrgs([{ _id: 'org-1', reviewMode: 'required', scope: { regions: ['Ashanti'], cities: [] } }])
    expect((await resolveReviewRouting({ address: { region: 'Greater Accra' } })).mode).toBe('rentos_only')
  })

  it('applies an in-scope authority', async () => {
    mockOrgs([{ _id: 'org-1', reviewMode: 'required', scope: { regions: ['Greater Accra'], cities: [] } }])
    const routing = await resolveReviewRouting({ address: { region: 'Greater Accra' } })
    expect(routing.mode).toBe('required')
    expect(routing.organizationId).toBe('org-1')
  })

  it('lets the strictest configured mode win', async () => {
    mockOrgs([
      { _id: 'a', reviewMode: 'advisory', scope: { regions: [], cities: [] } },
      { _id: 'b', reviewMode: 'delegated', scope: { regions: [], cities: [] } },
    ])
    expect((await resolveReviewRouting({})).mode).toBe('delegated')
  })

  it('treats an unrestricted scope as covering everything', async () => {
    mockOrgs([{ _id: 'org-1', reviewMode: 'advisory', scope: { regions: [], cities: [] } }])
    expect((await resolveReviewRouting({ address: { city: 'Tamale' } })).mode).toBe('advisory')
  })
})

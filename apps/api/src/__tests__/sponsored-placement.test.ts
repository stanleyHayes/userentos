import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

const mocks = vi.hoisted(() => ({ listProperties: vi.fn(), getSponsoredPlacements: vi.fn(), recordImpressions: vi.fn() }))
vi.mock('../container.js', () => ({ propertyService: { listProperties: mocks.listProperties } }))
// Listing now drops closed accounts' listings; no database in this unit test.
vi.mock('../services/closedAccounts.js', () => ({ closedAccountIds: async () => [], isClosedAccount: async () => false }))
vi.mock('../services/marketplace/sponsorshipServing.js', async original => ({
  ...await original<typeof import('../services/marketplace/sponsorshipServing.js')>(),
  getSponsoredPlacements: mocks.getSponsoredPlacements,
  recordImpressions: mocks.recordImpressions,
}))
import router from '../routes/properties.js'

const listing = (id: string) => ({ _id: id, id, title: `Listing ${id}`, listingStatus: 'published', status: 'available' })

describe('sponsored listings are opt-in per request', () => {
  let server: Server
  let url: string
  beforeAll(async () => {
    const app = express(); app.use(express.json()); app.use('/properties', router)
    server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/properties`
  })
  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listProperties.mockResolvedValue({ items: [listing('a'), listing('b'), listing('c')] })
    mocks.getSponsoredPlacements.mockResolvedValue([{ propertyId: 'c', sponsorshipId: 'camp-1', placement: 'search_top' }])
  })

  const list = async (qs = '') => {
    const res = await fetch(`${url}${qs}`)
    return { status: res.status, body: await res.json() }
  }

  it('gives a caller that does not ask organic order, no label and no impression', async () => {
    // The mobile apps, dropdowns and the saved-items filter all call this.
    const { status, body } = await list('?city=Accra')

    expect(status).toBe(200)
    expect(body.data.items.map((p: { id: string }) => p.id)).toEqual(['a', 'b', 'c'])
    expect(body.data.items.some((p: { sponsored?: boolean }) => p.sponsored)).toBe(false)
    expect(mocks.getSponsoredPlacements).not.toHaveBeenCalled()
    expect(mocks.recordImpressions).not.toHaveBeenCalled()
  })

  it('serves, labels and counts once for a screen that asks with placement=search_top', async () => {
    const { status, body } = await list('?city=Accra&placement=search_top')

    expect(status).toBe(200)
    expect(body.data.items[0]).toMatchObject({ id: 'c', sponsored: true, sponsorshipId: 'camp-1' })
    expect(mocks.getSponsoredPlacements).toHaveBeenCalledExactlyOnceWith('search_top', { city: 'Accra', onPage: ['a', 'b', 'c'] })
    expect(mocks.recordImpressions).toHaveBeenCalledExactlyOnceWith(['camp-1'])
  })

  it('refuses a placement nothing serves instead of quietly ignoring it', async () => {
    for (const placement of ['homepage', 'SEARCH_TOP', '']) {
      expect((await list(`?placement=${placement}`)).status).toBe(400)
    }
    expect((await list('?placement=search_top&placement=search_top')).status).toBe(400)
    expect(mocks.getSponsoredPlacements).not.toHaveBeenCalled()
  })
})

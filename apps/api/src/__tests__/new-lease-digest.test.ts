import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Agreement } from '../models/Agreement.js'
import { Property } from '../models/Property.js'
import { Business } from '../models/Business.js'
import { notify } from '../services/notify.js'
import { sendWeeklyNewLeaseDigest, MIN_LEASES_PER_CITY } from '../services/newLeaseDigest.js'

vi.mock('../models/Agreement.js', () => ({ Agreement: { find: vi.fn() } }))
vi.mock('../models/Property.js', () => ({ Property: { find: vi.fn() } }))
vi.mock('../models/Business.js', () => ({ Business: { find: vi.fn() } }))
vi.mock('../services/notify.js', () => ({ notify: vi.fn() }))

const chain = (rows: unknown[]) => ({ select: () => ({ lean: vi.fn().mockResolvedValue(rows) }) })

const BUSINESSES = [
  { ownerId: 'owner-approved', city: 'Tema', approvalStatus: 'approved' },
  { ownerId: 'owner-approved', city: 'tema', approvalStatus: 'approved' }, // same owner, second profile
  { ownerId: 'owner-second', city: 'TEMA', approvalStatus: 'approved' },
  { ownerId: 'owner-pending', city: 'Tema', approvalStatus: 'pending' },
  { ownerId: 'owner-rejected', city: 'Tema', approvalStatus: 'rejected' },
  { ownerId: 'owner-elsewhere', city: 'Ho', approvalStatus: 'approved' },
]

/** leases: property id -> city, one active lease per entry. */
function givenLeases(cities: string[]) {
  const leases = cities.map((_, i) => ({ _id: `agreement-${i}`, propertyId: `property-${i}` }))
  vi.mocked(Agreement.find).mockReturnValue(chain(leases) as never)
  vi.mocked(Property.find).mockReturnValue(chain(cities.map((city, i) => ({ _id: `property-${i}`, address: { city } }))) as never)
  return leases
}

describe('weekly new-lease digest for local businesses', () => {
  const now = new Date('2026-09-28T09:00:00Z')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(notify).mockResolvedValue(undefined as never)
    vi.mocked(Business.find).mockImplementation(((filter: { approvalStatus: string; city: RegExp }) =>
      chain(BUSINESSES.filter((b) => b.approvalStatus === filter.approvalStatus && filter.city.test(b.city)))) as never)
  })

  it('counts leases activated in the last seven days', async () => {
    givenLeases([])
    await sendWeeklyNewLeaseDigest(now)

    expect(vi.mocked(Agreement.find).mock.calls[0][0]).toEqual({
      activatedAt: { $gte: new Date('2026-09-21T09:00:00Z'), $lte: now },
    })
  })

  it('says nothing about a city with fewer than five new leases', async () => {
    expect(MIN_LEASES_PER_CITY).toBe(5)
    givenLeases(['Tema', 'Tema', 'tema', 'Tema'])

    expect(await sendWeeklyNewLeaseDigest(now)).toEqual({ cities: 0, notified: 0 })
    expect(notify).not.toHaveBeenCalled()
    expect(Business.find).not.toHaveBeenCalled()
  })

  it('sends one aggregate count per approved business owner once a city reaches five', async () => {
    const leases = givenLeases(['Tema', 'tema', 'Tema ', 'TEMA', 'Tema', 'Ho'])

    expect(await sendWeeklyNewLeaseDigest(now)).toEqual({ cities: 1, notified: 2 })

    expect(vi.mocked(notify).mock.calls.map(([n]) => n.userId).sort()).toEqual(['owner-approved', 'owner-second'])
    for (const [n] of vi.mocked(notify).mock.calls) {
      expect(n.title).toBe('5 new leases in Tema this week')
      expect(n.category).toBe('promotion')
      // Nothing that could lead back to one lease or one home.
      const text = JSON.stringify(n)
      for (const lease of leases) {
        expect(text).not.toContain(lease._id)
        expect(text).not.toContain(lease.propertyId)
      }
    }
  })

  it('only asks for approved businesses', async () => {
    givenLeases(Array(5).fill('Tema'))
    await sendWeeklyNewLeaseDigest(now)

    const filter = vi.mocked(Business.find).mock.calls[0][0] as unknown as { approvalStatus: string }
    expect(filter.approvalStatus).toBe('approved')
    expect(vi.mocked(notify).mock.calls.map(([n]) => n.userId)).not.toContain('owner-pending')
    expect(vi.mocked(notify).mock.calls.map(([n]) => n.userId)).not.toContain('owner-rejected')
  })
})

describe('lease data no longer drives business promotions', () => {
  const source = (file: string) => readFileSync(join(process.cwd(), 'src', file), 'utf8')

  it('lease activation sends businesses nothing about that lease', () => {
    const controller = source('controllers/agreementController.ts')
    expect(controller).not.toMatch(/Business\.find|category: 'promotion'/)
  })

  it('the business directory does not read agreements or properties', () => {
    const route = source('routes/businesses.ts')
    expect(route).not.toMatch(/models\/(Agreement|Property)\.js/)
  })
})

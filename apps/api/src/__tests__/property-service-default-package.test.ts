import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PropertyService } from '../services/propertyService.js'
import { User } from '../models/User.js'
import { SubscriptionPackage } from '../models/SubscriptionPackage.js'

vi.mock('../models/User.js', () => ({
  User: { findById: vi.fn() },
}))
vi.mock('../models/SubscriptionPackage.js', () => ({
  SubscriptionPackage: { findById: vi.fn(), findOne: vi.fn() },
}))
// The limit now resolves through the entitlement engine, which overlays
// explicit feature grants on top of the plan's columns. No grants here, so the
// plan's own maxProperties still decides — which is what these tests assert.
vi.mock('../models/PlanEntitlement.js', () => ({
  PlanEntitlement: { find: vi.fn(() => ({ lean: vi.fn().mockResolvedValue([]) })) },
}))

function makeRepo(count: number) {
  return {
    count: vi.fn().mockResolvedValue(count),
    ensureQuotaIndex: vi.fn().mockResolvedValue(undefined),
    findMany: vi.fn().mockResolvedValue(Array.from({ length: count }, () => ({}))),
    create: vi.fn().mockImplementation(async (data: Record<string, unknown>) => ({
      ...data,
      _id: { toString: () => 'prop-1' },
      toObject: () => ({ ...data }),
    })),
  }
}

const fakeLogger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }

const createData = {
  title: '2BR Apartment',
  description: 'Nice place',
  type: 'apartment',
  address: { street: '1 Oxford St', city: 'Accra', region: 'Greater Accra' },
  rentAmount: 1500,
  rentDurationMonths: 12,
  advanceMonths: 6,
}

function mockUser(user: Record<string, unknown> | null) {
  vi.mocked(User.findById).mockReturnValue({ lean: vi.fn().mockResolvedValue(user) } as never)
}

function mockDefaultPackage(pkg: Record<string, unknown> | null) {
  vi.mocked(SubscriptionPackage.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(pkg) } as never)
}

describe('PropertyService.create — default package enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks a user with no package once the default package limit is reached', async () => {
    mockUser({ _id: 'u1' }) // no subscriptionPackageId
    mockDefaultPackage({ _id: { toString: () => 'pkg-free' }, name: 'Starter', maxProperties: 3 })
    const repo = makeRepo(3)
    const svc = new PropertyService(repo as never, fakeLogger as never)

    const result = await svc.create(createData, 'u1')

    expect(result.status).toBe(403)
    expect((result as { error?: string }).error).toMatch(/Starter/)
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('allows creation under the default package limit', async () => {
    mockUser({ _id: 'u1' })
    mockDefaultPackage({ _id: { toString: () => 'pkg-free' }, name: 'Starter', maxProperties: 3 })
    const repo = makeRepo(2)
    const svc = new PropertyService(repo as never, fakeLogger as never)

    const result = await svc.create(createData, 'u1')

    expect(result.status).toBe(201)
    expect(repo.create).toHaveBeenCalledOnce()
  })

  it('does not cap when the default package is unlimited (-1)', async () => {
    mockUser({ _id: 'u1' })
    mockDefaultPackage({ _id: { toString: () => 'pkg-free' }, name: 'Starter', maxProperties: -1 })
    const repo = makeRepo(50)
    const svc = new PropertyService(repo as never, fakeLogger as never)

    const result = await svc.create(createData, 'u1')

    expect(result.status).toBe(201)
    expect(repo.create).toHaveBeenCalledOnce()
  })

  it('still enforces the assigned package limit when one exists', async () => {
    mockUser({ _id: 'u1', subscriptionPackageId: 'pkg-pro' })
    vi.mocked(SubscriptionPackage.findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ name: 'Pro', maxProperties: 5 }),
    } as never)
    const repo = makeRepo(5)
    const svc = new PropertyService(repo as never, fakeLogger as never)

    const result = await svc.create(createData, 'u1')

    expect(result.status).toBe(403)
    expect((result as { error?: string }).error).toMatch(/Pro/)
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('fails closed when the quota index cannot be established', async () => {
    const repo = makeRepo(0)
    repo.ensureQuotaIndex.mockRejectedValueOnce(new Error('Index unavailable'))
    const svc = new PropertyService(repo as never, fakeLogger as never)
    await expect(svc.create(createData, 'u1')).rejects.toThrow('Index unavailable')
    expect(repo.findMany).not.toHaveBeenCalled()
    expect(repo.create).not.toHaveBeenCalled()
  })

  it.each([0, 1])('uses the configured free quota after expiry with %s existing properties', async count => {
    mockUser({
      _id: 'u1',
      subscriptionPackageId: 'pkg-pro',
      subscriptionEndDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    })
    mockDefaultPackage({ _id: 'free', name: 'Free', maxProperties: 1 })
    const repo = makeRepo(count)
    const svc = new PropertyService(repo as never, fakeLogger as never)

    const result = await svc.create(createData, 'u1')

    expect(result.status).toBe(count === 0 ? 201 : 403)
    expect(repo.create).toHaveBeenCalledTimes(count === 0 ? 1 : 0)
  })
})

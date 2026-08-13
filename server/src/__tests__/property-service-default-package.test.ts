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

function makeRepo(count: number) {
  return {
    count: vi.fn().mockResolvedValue(count),
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

  it('blocks expired subscriptions regardless of remaining quota', async () => {
    mockUser({
      _id: 'u1',
      subscriptionPackageId: 'pkg-pro',
      subscriptionEndDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    })
    const repo = makeRepo(0)
    const svc = new PropertyService(repo as never, fakeLogger as never)

    const result = await svc.create(createData, 'u1')

    expect(result.status).toBe(403)
    expect((result as { error?: string }).error).toMatch(/expired/)
    expect(repo.create).not.toHaveBeenCalled()
  })
})

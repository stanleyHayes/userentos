import { describe, it, expect, vi, beforeEach } from 'vitest'
import { User } from '../models/User.js'
import { SubscriptionPackage } from '../models/SubscriptionPackage.js'
import { PlanEntitlement } from '../models/PlanEntitlement.js'
import {
  resolveEntitlements, requireEntitlement, requireQuota, getNumericFeature,
  EntitlementError, FEATURE_REGISTRY,
} from '../services/entitlements.js'

vi.mock('../models/User.js', () => ({ User: { findById: vi.fn() } }))
vi.mock('../models/SubscriptionPackage.js', () => ({
  SubscriptionPackage: { findById: vi.fn(), findOne: vi.fn() },
}))
vi.mock('../models/PlanEntitlement.js', () => ({ PlanEntitlement: { find: vi.fn() } }))

const mockUser = (doc: unknown) => vi.mocked(User.findById).mockReturnValue({ lean: vi.fn().mockResolvedValue(doc) } as never)
const mockPlan = (doc: unknown) => vi.mocked(SubscriptionPackage.findById).mockReturnValue({ lean: vi.fn().mockResolvedValue(doc) } as never)
const mockDefaultPlan = (doc: unknown) => vi.mocked(SubscriptionPackage.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(doc) } as never)
const mockGrants = (rows: unknown[]) => vi.mocked(PlanEntitlement.find).mockReturnValue({ lean: vi.fn().mockResolvedValue(rows) } as never)

describe('entitlement engine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGrants([])
    mockDefaultPlan(null)
  })

  it('gives a user with no plan the free-tier defaults, never a paid capability', async () => {
    mockUser({ _id: 'u1' })

    const { features, planName } = await resolveEntitlements('u1')

    expect(planName).toBe('Free')
    expect(features['storefront.enabled']).toBe(false)
    expect(features['storefront.custom_domain']).toBe(false)
    expect(features['promotion.enabled']).toBe(false)
    expect(features['affiliate.enabled']).toBe(false)
  })

  it('lets an explicit grant override the plan column', async () => {
    mockUser({ _id: 'u1', subscriptionPackageId: 'plan-1' })
    mockPlan({ _id: { toString: () => 'plan-1' }, name: 'Pro', version: 2, maxProperties: 10 })
    mockGrants([
      { featureKey: 'property.limit', value: 25 },
      { featureKey: 'storefront.enabled', value: true },
    ])

    const { features, planVersion } = await resolveEntitlements('u1')

    expect(planVersion).toBe(2)
    expect(features['property.limit']).toBe(25) // grant wins over maxProperties: 10
    expect(features['storefront.enabled']).toBe(true)
  })

  it('reads grants for the subscriber plan version, so old subscribers keep their terms', async () => {
    mockUser({ _id: 'u1', subscriptionPackageId: 'plan-1' })
    mockPlan({ _id: { toString: () => 'plan-1' }, name: 'Pro', version: 3 })

    await resolveEntitlements('u1')

    expect(PlanEntitlement.find).toHaveBeenCalledWith({ planId: 'plan-1', planVersion: 3 })
  })

  it('degrades an expired subscription to the free tier without deleting anything', async () => {
    mockUser({ _id: 'u1', subscriptionPackageId: 'plan-1', subscriptionEndDate: new Date(Date.now() - 86400000) })

    const { features, planName } = await resolveEntitlements('u1')

    expect(planName).toBe('Expired')
    expect(features['storefront.enabled']).toBe(false)
    expect(SubscriptionPackage.findById).not.toHaveBeenCalled()
  })

  it('falls back to the plan marked default when the user has no subscription', async () => {
    mockUser({ _id: 'u1' })
    mockDefaultPlan({ _id: { toString: () => 'free-1' }, name: 'Starter', maxProperties: 2 })

    const { features, planName } = await resolveEntitlements('u1')

    expect(planName).toBe('Starter')
    expect(features['property.limit']).toBe(2)
  })

  it('blocks a capability the plan does not include, and names it', async () => {
    mockUser({ _id: 'u1' })

    await expect(requireEntitlement('u1', 'storefront.custom_domain'))
      .rejects.toBeInstanceOf(EntitlementError)
  })

  it('allows a granted capability', async () => {
    mockUser({ _id: 'u1', subscriptionPackageId: 'plan-1' })
    mockPlan({ _id: { toString: () => 'plan-1' }, name: 'Pro' })
    mockGrants([{ featureKey: 'storefront.custom_domain', value: true }])

    await expect(requireEntitlement('u1', 'storefront.custom_domain')).resolves.toBeUndefined()
  })

  it('treats -1 as unlimited', async () => {
    mockUser({ _id: 'u1', subscriptionPackageId: 'plan-1' })
    mockPlan({ _id: { toString: () => 'plan-1' }, name: 'Unlimited', maxProperties: -1 })

    await expect(requireQuota('u1', 'property.limit', 9999)).resolves.toBeUndefined()
  })

  it('blocks at the limit, not one past it', async () => {
    mockUser({ _id: 'u1', subscriptionPackageId: 'plan-1' })
    mockPlan({ _id: { toString: () => 'plan-1' }, name: 'Starter', maxProperties: 3 })

    await expect(requireQuota('u1', 'property.limit', 2)).resolves.toBeUndefined()
    await expect(requireQuota('u1', 'property.limit', 3)).rejects.toThrow(/Starter/)
  })

  it('reads the platform fee from the plan for payment splits', async () => {
    mockUser({ _id: 'u1', subscriptionPackageId: 'plan-1' })
    mockPlan({ _id: { toString: () => 'plan-1' }, name: 'Pro', platformFeePercent: 3 })

    expect(await getNumericFeature('u1', 'platform.fee_percent')).toBe(3)
  })

  it('defaults every registry feature to the safe, unpaid value', () => {
    for (const [key, meta] of Object.entries(FEATURE_REGISTRY)) {
      if (meta.type === 'boolean') {
        expect(meta.default, `${key} must default to false`).toBe(false)
      }
    }
  })
})

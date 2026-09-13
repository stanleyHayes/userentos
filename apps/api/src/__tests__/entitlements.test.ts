import { describe, it, expect, vi, beforeEach } from 'vitest'
import { User } from '../models/User.js'
import { SubscriptionPackage } from '../models/SubscriptionPackage.js'
import { PlanEntitlement } from '../models/PlanEntitlement.js'
import { Payment } from '../models/Payment.js'
import {
  resolveEntitlements, requireEntitlement, requireQuota, getNumericFeature,
  EntitlementError, FEATURE_REGISTRY, snapshotPackageEntitlements, isFeatureKey,
} from '../services/entitlements.js'

vi.mock('../models/User.js', () => ({ User: { findById: vi.fn() } }))
vi.mock('../models/SubscriptionPackage.js', () => ({
  SubscriptionPackage: { findById: vi.fn(), findOne: vi.fn() },
}))
vi.mock('../models/PlanEntitlement.js', () => ({ PlanEntitlement: { find: vi.fn() } }))
vi.mock('../models/Payment.js', () => ({ Payment: { exists: vi.fn().mockResolvedValue(null) } }))

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

  it('captures complete plan terms including legacy limits independently from future changes', async () => {
    const plan = { _id: 'plan', name: 'Pro', version: 2, maxProperties: 8, platformFeePercent: 4 }
    mockGrants([{ featureKey: 'blog.limit', value: 12 }])
    const snapshot = await snapshotPackageEntitlements(plan)
    plan.maxProperties = 2; plan.platformFeePercent = 9; plan.version = 3
    expect(snapshot).toMatchObject({ planId: 'plan', planName: 'Pro', planVersion: 2, features: { 'property.limit': 8, 'platform.fee_percent': 4, 'blog.limit': 12, 'affiliate.enabled': false } })
  })
  it.each(['__proto__', 'constructor', 'toString'])('does not treat inherited key %s as a capability', key => {
    expect(isFeatureKey(key)).toBe(false)
  })
  it('refuses to snapshot malformed grants instead of persisting invalid purchase terms', async () => {
    mockGrants([{ featureKey: 'property.limit', value: 'unlimited' }])
    await expect(snapshotPackageEntitlements({ _id: 'plan' })).rejects.toThrow('Invalid entitlement value')
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

    expect(planName).toBe('Free')
    expect(features['storefront.enabled']).toBe(false)
    expect(SubscriptionPackage.findById).not.toHaveBeenCalled()
  })

  it('falls back to the plan marked default when the user has no subscription', async () => {
    mockUser({ _id: 'u1' })
    mockDefaultPlan({ _id: { toString: () => 'free-1' }, name: 'Starter', maxProperties: 2 })

    const { features, planName } = await resolveEntitlements('u1')

    expect(SubscriptionPackage.findOne).toHaveBeenCalledWith({ isDefault: true, isActive: true, price: 0 })
    expect(planName).toBe('Starter')
    expect(features['property.limit']).toBe(2)
  })
  it.each(['expired', 'missing', 'invalid-date'])('uses configured free entitlements for %s legacy subscriptions', async scenario => {
    mockUser({ _id: 'u1', subscriptionPackageId: 'old', ...(scenario === 'missing' ? {} : { subscriptionEndDate: scenario === 'expired' ? new Date(0) : new Date('invalid') }) })
    mockPlan(null)
    mockDefaultPlan({ _id: 'free', name: 'Configured free', version: 4, maxProperties: 1 })
    mockGrants([{ featureKey: 'blog.limit', value: 2 }])
    const resolved = await resolveEntitlements('u1')
    expect(resolved).toMatchObject({ planId: 'free', planVersion: 4, features: { 'property.limit': 1, 'blog.limit': 2, 'storefront.enabled': false } })
    expect(PlanEntitlement.find).toHaveBeenLastCalledWith({ planId: 'free', planVersion: 4 })
  })
  it.each(['expired', 'refunded'])('uses configured free limits after a saved purchase becomes %s', async status => {
    const startsAt = new Date(Date.now() - 60_000).toISOString()
    const endsAt = new Date(status === 'expired' ? Date.now() - 1000 : Date.now() + 60_000).toISOString()
    mockUser({ _id: 'u1', subscriptionPackageId: 'paid', subscriptionPlanVersion: 2, subscriptionPaymentId: 'purchase', subscriptionStartDate: new Date(startsAt), subscriptionEndDate: new Date(endsAt), subscriptionSnapshotJson: JSON.stringify({ paymentId: 'purchase', startsAt, endsAt, terms: { packageId: 'paid', packageVersion: 2, featuresJson: JSON.stringify({ 'property.limit': 50, 'blog.limit': 100 }) } }) })
    vi.mocked(Payment.exists).mockResolvedValue(null)
    mockDefaultPlan({ _id: 'free', name: 'Configured free', version: 4, maxProperties: 1 })
    mockGrants([{ featureKey: 'blog.limit', value: 2 }])
    expect((await resolveEntitlements('u1')).features).toMatchObject({ 'property.limit': 1, 'blog.limit': 2 })
    await expect(requireQuota('u1', 'property.limit', 1)).rejects.toBeInstanceOf(EntitlementError)
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

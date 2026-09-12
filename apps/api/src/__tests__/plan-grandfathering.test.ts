import { describe, it, expect, vi, beforeEach } from 'vitest'

const userFindById = vi.fn()
const planFindById = vi.fn()
const planFindOne = vi.fn()
const grantsFind = vi.fn()

vi.mock('../models/User.js', () => ({ User: { findById: userFindById } }))
vi.mock('../models/SubscriptionPackage.js', () => ({
  SubscriptionPackage: { findById: planFindById, findOne: planFindOne },
}))
vi.mock('../models/PlanEntitlement.js', () => ({ PlanEntitlement: { find: grantsFind } }))

const { resolveEntitlements } = await import('../services/entitlements.js')

const lean = (v: unknown) => ({ lean: () => Promise.resolve(v) })
const PLAN = { _id: 'plan1', name: 'Professional', version: 2, maxProperties: 10, platformFeePercent: 5 }

/** Grants differ per version, which is the whole point of versioning. */
function grantsByVersion(byVersion: Record<number, Array<{ featureKey: string; value: unknown }>>) {
  grantsFind.mockImplementation((q: { planVersion: number }) => lean(byVersion[q.planVersion] ?? []))
}

describe('plan versions grandfather existing subscribers (spec §7.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    planFindById.mockReturnValue(lean(PLAN))
    grantsByVersion({
      1: [{ featureKey: 'blog.limit', value: 50 }],
      2: [{ featureKey: 'blog.limit', value: 5 }],
    })
  })

  it('keeps a v1 subscriber on v1 terms after v2 is published', async () => {
    // The bug: applyPlan read the PLAN's current version, so publishing v2
    // re-priced every existing subscriber the instant it went live.
    userFindById.mockReturnValue(lean({
      subscriptionPackageId: 'plan1', subscriptionPlanVersion: 1,
      subscriptionEndDate: new Date('2099-01-01'),
    }))

    const r = await resolveEntitlements('u1')

    expect(r.planVersion).toBe(1)
    expect(r.features['blog.limit']).toBe(50)
  })

  it('puts a new subscriber on the current version', async () => {
    userFindById.mockReturnValue(lean({
      subscriptionPackageId: 'plan1', subscriptionPlanVersion: 2,
      subscriptionEndDate: new Date('2099-01-01'),
    }))

    const r = await resolveEntitlements('u2')

    expect(r.planVersion).toBe(2)
    expect(r.features['blog.limit']).toBe(5)
  })

  it('falls back to the plan version for a subscriber predating the field', async () => {
    // Nobody signed up before this was tracked should lose their plan.
    userFindById.mockReturnValue(lean({
      subscriptionPackageId: 'plan1',
      subscriptionEndDate: new Date('2099-01-01'),
    }))

    const r = await resolveEntitlements('u3')

    expect(r.planVersion).toBe(2)
  })

  it('still degrades an expired subscription regardless of version', async () => {
    userFindById.mockReturnValue(lean({
      subscriptionPackageId: 'plan1', subscriptionPlanVersion: 1,
      subscriptionEndDate: new Date('2000-01-01'),
    }))

    const r = await resolveEntitlements('u4')

    expect(r.planName).toBe('Expired')
    // Back to the registry default, not the grandfathered grant.
    expect(r.features['blog.limit']).toBe(0)
  })
})

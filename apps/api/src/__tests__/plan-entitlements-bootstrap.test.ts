import { describe, it, expect, vi, beforeEach } from 'vitest'

const planFind = vi.fn()
const countDocuments = vi.fn()
const updateOne = vi.fn()

vi.mock('../models/SubscriptionPackage.js', () => ({
  SubscriptionPackage: { find: () => ({ lean: planFind }) },
}))
vi.mock('../models/PlanEntitlement.js', () => ({
  PlanEntitlement: { countDocuments, updateOne },
}))

const { bootstrapPlanEntitlements } = await import('../bootstrapPlanEntitlements.js')

const PLANS = [
  { _id: 'p_starter', slug: 'starter', version: 1 },
  { _id: 'p_pro', slug: 'professional', version: 1 },
  { _id: 'p_ent', slug: 'enterprise', version: 1 },
]

/** Every featureKey/value pair written for a given plan. */
function grantsFor(planId: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const call of updateOne.mock.calls) {
    const [filter, update] = call as [{ planId: string; featureKey: string }, { $setOnInsert: { value: unknown } }]
    if (filter.planId === planId) out[filter.featureKey] = update.$setOnInsert.value
  }
  return out
}

describe('default plan entitlements (spec §7.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    planFind.mockResolvedValue(PLANS)
    countDocuments.mockResolvedValue(0)
    updateOne.mockResolvedValue({ upsertedCount: 1 })
  })

  it('makes the paid tiers actually grant the storefront surface', async () => {
    await bootstrapPlanEntitlements()

    // The bug this closes: every plan resolved to the free defaults, so a
    // GHS 150/month subscriber could not create a storefront at all.
    expect(grantsFor('p_pro')['storefront.enabled']).toBe(true)
    expect(grantsFor('p_ent')['storefront.enabled']).toBe(true)
    expect(grantsFor('p_ent')['affiliate.enabled']).toBe(true)
    expect(grantsFor('p_ent')['blog.limit']).toBe(-1)
  })

  it('keeps the free tier free', async () => {
    await bootstrapPlanEntitlements()
    const starter = grantsFor('p_starter')
    expect(starter['storefront.enabled']).toBe(false)
    expect(starter['promotion.enabled']).toBe(false)
    expect(starter['affiliate.enabled']).toBe(false)
    expect(starter['blog.limit']).toBe(0)
  })

  it('escalates capability upward across the tiers', async () => {
    await bootstrapPlanEntitlements()
    const pro = grantsFor('p_pro')
    const ent = grantsFor('p_ent')
    // Custom domains are the enterprise differentiator; pro must not have them.
    expect(pro['storefront.custom_domain']).toBe(false)
    expect(ent['storefront.custom_domain']).toBe(true)
    expect(Number(ent['sponsorship.quota'])).toBeGreaterThan(Number(pro['sponsorship.quota']))
  })

  it('never overwrites grants an admin has already authored', async () => {
    countDocuments.mockResolvedValue(3)
    await bootstrapPlanEntitlements()
    expect(updateOne).not.toHaveBeenCalled()
  })

  it('leaves property.limit and platform fee to the plan columns', async () => {
    await bootstrapPlanEntitlements()
    // applyPlan derives these from maxProperties / platformFeePercent; granting
    // them here would silently override what an admin set on the plan itself.
    for (const p of ['p_starter', 'p_pro', 'p_ent']) {
      expect(grantsFor(p)).not.toHaveProperty('property.limit')
      expect(grantsFor(p)).not.toHaveProperty('platform.fee_percent')
    }
  })

  it('ignores a plan whose slug it does not recognise', async () => {
    planFind.mockResolvedValue([{ _id: 'p_x', slug: 'bespoke-deal', version: 1 }])
    await bootstrapPlanEntitlements()
    expect(updateOne).not.toHaveBeenCalled()
  })

  it('writes grants against the plan version, so old subscribers keep theirs', async () => {
    planFind.mockResolvedValue([{ _id: 'p_ent', slug: 'enterprise', version: 4 }])
    await bootstrapPlanEntitlements()
    expect(updateOne.mock.calls.every(([f]) => (f as { planVersion: number }).planVersion === 4)).toBe(true)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { User } from '../models/User.js'
import { SubscriptionPackage } from '../models/SubscriptionPackage.js'
import { Property } from '../models/Property.js'
import { PlanEntitlement } from '../models/PlanEntitlement.js'
import { subscriptionController } from '../controllers/subscriptionController.js'
import { resolveEntitlements } from '../services/entitlements.js'
vi.mock('../models/User.js', () => ({ User: { findById: vi.fn() } }))
vi.mock('../models/SubscriptionPackage.js', () => ({ SubscriptionPackage: { findOne: vi.fn(), findById: vi.fn() } }))
vi.mock('../models/Property.js', () => ({ Property: { countDocuments: vi.fn() } }))
vi.mock('../models/PlanEntitlement.js', () => ({ PlanEntitlement: { find: vi.fn() } }))
vi.mock('../models/Payment.js', () => ({ Payment: { exists: vi.fn().mockResolvedValue(null) } }))
const lean = (value: unknown) => ({ lean: async () => value })
async function summary() {
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn() }
  await subscriptionController.mySubscription({ user: { userId: 'user' } } as never, response as never)
  return response.json.mock.calls[0][0].data
}
describe('subscription summary follows effective quota', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(User.findById).mockReturnValue(lean({ _id: 'user', subscriptionPackageId: 'old', subscriptionEndDate: new Date(0) }) as never)
    vi.mocked(SubscriptionPackage.findOne).mockReturnValue(lean({ _id: 'free', name: 'Free', version: 4, maxProperties: 9, price: 0 }) as never)
    vi.mocked(SubscriptionPackage.findById).mockReturnValue(lean(null) as never)
    vi.mocked(PlanEntitlement.find).mockReturnValue(lean([{ featureKey: 'property.limit', value: 1 }]) as never)
    vi.mocked(Property.countDocuments).mockResolvedValue(0)
  })
  it.each([0, 1])('shows the free grant after expiry with %s existing properties', async count => {
    vi.mocked(Property.countDocuments).mockResolvedValue(count)
    const result = await summary()
    expect(result).toMatchObject({ billingSource: 'free', fallbackApplied: true, previousSubscriptionInactive: true, isExpired: false, maxProperties: 1, canAddProperty: count < 1, package: { id: 'free', maxProperties: 1, price: 0 } })
    expect(result.subscriptionEndDate).toBeUndefined()
    expect(result.maxProperties).toBe((await resolveEntitlements('user')).features['property.limit'])
  })
  it('reports versioned grants rather than a legacy package column', async () => {
    vi.mocked(User.findById).mockReturnValue(lean({ _id: 'user', subscriptionPackageId: 'plan', subscriptionPlanVersion: 2 }) as never)
    vi.mocked(SubscriptionPackage.findById).mockReturnValue(lean({ _id: 'plan', version: 3, maxProperties: 20 }) as never)
    expect(await summary()).toMatchObject({ maxProperties: 1, fallbackApplied: false, package: { id: 'plan', version: 2, maxProperties: 1 } })
    expect(PlanEntitlement.find).toHaveBeenCalledWith({ planId: 'plan', planVersion: 2 })
  })
  it('shows free access after a saved paid purchase is refunded', async () => {
    const startsAt = new Date(Date.now() - 60_000).toISOString(), endsAt = new Date(Date.now() + 60_000).toISOString()
    vi.mocked(User.findById).mockReturnValue(lean({ _id: 'user', subscriptionPackageId: 'paid', subscriptionPlanVersion: 2, subscriptionPaymentId: 'payment', subscriptionStartDate: new Date(startsAt), subscriptionEndDate: new Date(endsAt), subscriptionSnapshotJson: JSON.stringify({ paymentId: 'payment', startsAt, endsAt, terms: { packageId: 'paid', packageVersion: 2, featuresJson: '{"property.limit":50}' } }) }) as never)
    expect(await summary()).toMatchObject({ billingSource: 'free', fallbackApplied: true, previousSubscriptionInactive: true, maxProperties: 1, package: { id: 'free' } })
  })
})

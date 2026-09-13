import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { StorePurchase } from '../models/StorePurchase.js'
import { StoreProduct } from '../models/StoreProduct.js'
import { User } from '../models/User.js'
import { prepareGoogleEntitlements } from '../services/storeBilling/prepareEntitlements.js'
import { StorePurchaseConflict } from '../services/storeBilling/purchaseJournal.js'

vi.mock('../models/StorePurchase.js', () => ({ StorePurchase: { findOne: vi.fn(), findOneAndUpdate: vi.fn() } }))
vi.mock('../models/StoreProduct.js', () => ({ StoreProduct: { findOne: vi.fn() } }))
vi.mock('../models/User.js', () => ({ User: { exists: vi.fn() } }))
const now = new Date('2026-09-13T00:00:00Z')
const item = { productId: 'pro', basePlanId: 'monthly', accessEligible: true, expiresAt: '2026-10-01T00:00:00Z' }
const purchase = { applicationId: 'gh.rentos.mobile', environment: 'production', userId: 'user', revision: 2, providerState: 'SUBSCRIPTION_STATE_ACTIVE', startedAt: '2026-09-01T00:00:00Z', items: [item] }
const snapshot = { planId: 'plan', planName: 'Pro', planVersion: 1, billingCycle: 'monthly', benefits: ['Five listings'], features: { 'property.limit': 5 } }
const mapping = { _id: 'mapping', packageId: 'plan', isActive: false, entitlementSnapshot: snapshot }
const lean = (value: unknown) => ({ lean: vi.fn().mockResolvedValue(value) })
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('GOOGLE_PLAY_PACKAGE_NAME', 'gh.rentos.mobile')
  vi.mocked(StorePurchase.findOne).mockReturnValue(lean(purchase) as never)
  vi.mocked(StorePurchase.findOneAndUpdate).mockReturnValue(lean({ preparedRevision: 2 }) as never)
  vi.mocked(StoreProduct.findOne).mockReturnValue(lean(mapping) as never)
  vi.mocked(User.exists).mockResolvedValue({ _id: 'user' } as never)
})
afterEach(() => vi.unstubAllEnvs())
describe('preparing store entitlement grants', () => {
  it('matches product AND base plan and preserves historical terms when no longer on sale', async () => {
    await prepareGoogleEntitlements('user', 'purchase', 2, now)
    expect(StoreProduct.findOne).toHaveBeenCalledWith({ platform: 'google', productId: 'pro', basePlanId: 'monthly' })
    expect(StorePurchase.findOneAndUpdate).toHaveBeenCalledWith({ _id: 'purchase', userId: 'user', revision: 2 }, { $set: {
      preparedRevision: 2, entitlementState: 'prepared', preparedGrants: [{ productId: 'pro', basePlanId: 'monthly', expiresAt: item.expiresAt, mappingId: 'mapping', packageId: 'plan', snapshot }],
    } }, expect.any(Object))
  })
  it('rejects a journal from a different app or a test journal in production', async () => {
    vi.mocked(StorePurchase.findOne).mockReturnValueOnce(lean({ ...purchase, applicationId: 'other.app' }) as never)
    await expect(prepareGoogleEntitlements('user', 'purchase', 2, now)).rejects.toThrow('different application')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('GOOGLE_PLAY_ALLOW_TEST_PURCHASES', 'true')
    vi.mocked(StorePurchase.findOne).mockReturnValueOnce(lean({ ...purchase, environment: 'test' }) as never)
    await expect(prepareGoogleEntitlements('user', 'purchase', 2, now)).rejects.toThrow('Test purchase')
    expect(StorePurchase.findOneAndUpdate).not.toHaveBeenCalled()
  })
  it('refuses missing mappings without storing a partial entitlement set', async () => {
    vi.mocked(StoreProduct.findOne).mockReturnValue(lean(null) as never)
    await expect(prepareGoogleEntitlements('user', 'purchase', 2, now)).rejects.toThrow('no RentOS entitlement mapping')
    expect(StorePurchase.findOneAndUpdate).not.toHaveBeenCalled()
  })
  it('rejects snapshots tied to a different package', async () => {
    vi.mocked(StoreProduct.findOne).mockReturnValue(lean({ ...mapping, packageId: 'other' }) as never)
    await expect(prepareGoogleEntitlements('user', 'purchase', 2, now)).rejects.toThrow('snapshot is invalid')
  })
  it('rejects malformed feature types', async () => {
    vi.mocked(StoreProduct.findOne).mockReturnValue(lean({ ...mapping, entitlementSnapshot: { ...snapshot, features: { 'property.limit': 'unlimited' } } }) as never)
    await expect(prepareGoogleEntitlements('user', 'purchase', 2, now)).rejects.toThrow('feature is invalid')
  })
  it('produces no grants for expired observations even if their saved eligibility was true', async () => {
    await prepareGoogleEntitlements('user', 'purchase', 2, new Date('2026-11-01'))
    expect(StoreProduct.findOne).not.toHaveBeenCalled()
    expect(StorePurchase.findOneAndUpdate).toHaveBeenCalledWith(expect.any(Object), { $set: { preparedGrants: [], preparedRevision: 2, entitlementState: 'prepared' } }, expect.any(Object))
  })
  it('does not grant a provider-restricted subscription with stale eligible items', async () => {
    vi.mocked(StorePurchase.findOne).mockReturnValue(lean({ ...purchase, providerState: 'SUBSCRIPTION_STATE_ON_HOLD' }) as never)
    await prepareGoogleEntitlements('user', 'purchase', 2, now)
    expect(StoreProduct.findOne).not.toHaveBeenCalled()
  })
  it('checks current account eligibility before preparing grants', async () => {
    vi.mocked(User.exists).mockResolvedValue(null)
    await expect(prepareGoogleEntitlements('user', 'purchase', 2, now)).rejects.toThrow('not eligible')
    expect(StorePurchase.findOneAndUpdate).not.toHaveBeenCalled()
  })
  it('rejects stale revision requests and revisions superseded during preparation', async () => {
    vi.mocked(StorePurchase.findOne).mockReturnValueOnce(lean(null) as never)
    await expect(prepareGoogleEntitlements('user', 'purchase', 1, now)).rejects.toBeInstanceOf(StorePurchaseConflict)
    vi.mocked(StorePurchase.findOneAndUpdate).mockReturnValue(lean(null) as never)
    await expect(prepareGoogleEntitlements('user', 'purchase', 2, now)).rejects.toBeInstanceOf(StorePurchaseConflict)
  })
})

import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { StoreProduct } from '../models/StoreProduct.js'
import { activateGoogleEntitlements, activeStoreSubscription } from '../services/storeBilling/activeEntitlements.js'
import { resolveEntitlements, requireQuota, EntitlementError } from '../services/entitlements.js'
import { prepareGoogleEntitlements } from '../services/storeBilling/prepareEntitlements.js'
import { StorePurchase } from '../models/StorePurchase.js'
import { recordGooglePurchase, StorePurchaseConflict, storeTokenContext } from '../services/storeBilling/purchaseJournal.js'
import { decryptStoreToken } from '../services/storeBilling/tokenVault.js'
import { purchaseTokenHash, verifyGoogleSubscription } from '../services/storeBilling/googlePlay.js'

vi.mock('../services/storeBilling/googlePlay.js', async importOriginal => ({ ...await importOriginal<object>(), verifyGoogleSubscription: vi.fn() }))
const localUri = 'mongodb://localhost:28018/rentos_compliance_e2e'
// Explicit opt-in only; never bind this suite to a developer/production DB.
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== localUri)('store journal real-Mongo concurrency', () => {
  const userId = new mongoose.Types.ObjectId()
  const mappingId = new mongoose.Types.ObjectId()
  const packageId = new mongoose.Types.ObjectId().toString()
  const token = `isolated-purchase-${userId}`
  const app = 'gh.rentos.mobile'
  function observation(): Awaited<ReturnType<typeof verifyGoogleSubscription>> {
    return { platform: 'google' as const, packageName: app, purchaseTokenHash: purchaseTokenHash(token), state: 'SUBSCRIPTION_STATE_ACTIVE', environment: 'production' as const,
      acknowledged: false, startedAt: '2026-09-01T00:00:00Z', verifiedAt: new Date().toISOString(), linkedPurchaseTokenHash: null,
      items: [{ productId: `fixture-${userId}`, basePlanId: 'monthly', offerId: null, expiresAt: '2027-09-01T00:00:00Z', autoRenewing: true, latestOrderId: null, accessEligible: true }],
    }
  }
  beforeAll(async () => {
    vi.stubEnv('STORE_BILLING_ENCRYPTION_KEY', 'a'.repeat(64))
    vi.stubEnv('GOOGLE_PLAY_PACKAGE_NAME', app)
    vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_FILE', '/fixture/not-used.json')
    await mongoose.connect(localUri)
    await StorePurchase.init()
    await StoreProduct.create({ _id: mappingId, platform: 'google', productId: `fixture-${userId}`, basePlanId: 'monthly', packageId, isActive: false,
      entitlementSnapshot: { planId: packageId, planName: 'Fixture', planVersion: 1, billingCycle: 'monthly', benefits: [], features: { 'property.limit': 8 } },
    })
    await mongoose.connection.db!.collection('users').insertOne({ _id: userId, email: `${userId}@rentos.test`, storeAccountToken: randomUUID(), roles: ['landlord'] })
  })
  afterAll(async () => {
    await StoreProduct.deleteOne({ _id: mappingId })
    await StorePurchase.deleteMany({ userId: userId.toString() })
    await mongoose.connection.db!.collection('users').deleteOne({ _id: userId })
    await mongoose.disconnect()
    vi.unstubAllEnvs()
  })
  it('persists one encrypted receipt, fences concurrent updates and accepts a freshly verified retry', async () => {
    vi.mocked(verifyGoogleSubscription).mockResolvedValue(observation())
    const first = await recordGooglePurchase(userId.toString(), token)
    expect(first?.revision).toBe(1)
    expect(first?.entitlementState).toBe('pending')
    expect(first).not.toHaveProperty('tokenCiphertext')
    const stored = await StorePurchase.findById(first!._id).select('+tokenCiphertext').lean()
    expect(decryptStoreToken(stored!.tokenCiphertext, storeTokenContext(app, purchaseTokenHash(token), userId.toString()))).toBe(token)

    const prepared = await prepareGoogleEntitlements(userId.toString(), first!._id.toString(), 1)
    expect(prepared.preparedGrants[0].snapshot.features['property.limit']).toBe(8)
    expect(prepared.entitlementState).toBe('prepared')
    await mongoose.connection.db!.collection('users').updateOne({ _id: userId }, { $set: { suspendedAt: new Date() } })
    await expect(activateGoogleEntitlements(userId.toString(), first!._id.toString(), 1)).rejects.toThrow('not eligible')
    await mongoose.connection.db!.collection('users').updateOne({ _id: userId }, { $unset: { suspendedAt: 1 } })
    await activateGoogleEntitlements(userId.toString(), first!._id.toString(), 1)
    expect((await resolveEntitlements(userId.toString())).features['property.limit']).toBe(8)
    await expect(requireQuota(userId.toString(), 'property.limit', 7)).resolves.toBeUndefined()
    await expect(requireQuota(userId.toString(), 'property.limit', 8)).rejects.toBeInstanceOf(EntitlementError)

    let arrivals = 0
    let release: () => void = () => {}
    const barrier = new Promise<void>(resolve => { release = resolve })
    vi.mocked(verifyGoogleSubscription).mockImplementation(async () => {
      arrivals += 1
      if (arrivals === 2) release()
      await barrier
      return observation()
    })
    const racing = await Promise.allSettled([recordGooglePurchase(userId.toString(), token), recordGooglePurchase(userId.toString(), token)])
    expect(racing.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = racing.find(result => result.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toBeInstanceOf(StorePurchaseConflict)
    const refreshed = await StorePurchase.findById(first!._id).lean()
    expect(refreshed?.revision).toBe(2)
    expect(refreshed?.entitlementState).toBe('pending')
    expect(refreshed?.preparedGrants).toHaveLength(0)
    expect(refreshed?.preparedRevision).toBeUndefined()
    await expect(activateGoogleEntitlements(userId.toString(), first!._id.toString(), 1)).rejects.toBeInstanceOf(StorePurchaseConflict)
    await expect(prepareGoogleEntitlements(userId.toString(), first!._id.toString(), 1)).rejects.toBeInstanceOf(StorePurchaseConflict)
    vi.mocked(verifyGoogleSubscription).mockResolvedValue(observation())
    expect((await recordGooglePurchase(userId.toString(), token))?.revision).toBe(3)
    expect(await StorePurchase.countDocuments({ userId: userId.toString() })).toBe(1)
    await prepareGoogleEntitlements(userId.toString(), first!._id.toString(), 3)
    await activateGoogleEntitlements(userId.toString(), first!._id.toString(), 3)
    const replacementToken = `${token}-replacement`
    vi.mocked(verifyGoogleSubscription).mockResolvedValue({ ...observation(), purchaseTokenHash: purchaseTokenHash(replacementToken), linkedPurchaseTokenHash: purchaseTokenHash(token) })
    const replacement = await recordGooglePurchase(userId.toString(), replacementToken)
    await prepareGoogleEntitlements(userId.toString(), replacement!._id.toString(), 1)
    await activateGoogleEntitlements(userId.toString(), replacement!._id.toString(), 1)
    expect((await activeStoreSubscription(userId.toString()))?.purchaseId).toBe(replacement!._id.toString())
    vi.mocked(verifyGoogleSubscription).mockResolvedValue({ ...observation(), state: 'SUBSCRIPTION_STATE_EXPIRED', items: [], purchaseTokenHash: purchaseTokenHash(replacementToken), linkedPurchaseTokenHash: purchaseTokenHash(token) })
    await recordGooglePurchase(userId.toString(), replacementToken)
    await prepareGoogleEntitlements(userId.toString(), replacement!._id.toString(), 2)
    await activateGoogleEntitlements(userId.toString(), replacement!._id.toString(), 2)
    expect(await activeStoreSubscription(userId.toString())).toBeNull()

  })
})

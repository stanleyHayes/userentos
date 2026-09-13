import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { StoreNotification } from '../models/StoreNotification.js'
import { processGoogleNotification } from '../services/storeBilling/googleNotifications.js'
import { StoreProduct } from '../models/StoreProduct.js'
import { StorePurchase } from '../models/StorePurchase.js'
import { completeGooglePurchase } from '../services/storeBilling/completePurchase.js'
import { recoverGooglePurchases } from '../services/storeBilling/recoverPurchases.js'
import { activeStoreSubscription } from '../services/storeBilling/activeEntitlements.js'
import { acknowledgeGoogleSubscription, verifyGoogleSubscription, purchaseTokenHash } from '../services/storeBilling/googlePlay.js'
vi.mock('../services/storeBilling/googlePlay.js', async original => ({ ...await original<object>(), verifyGoogleSubscription: vi.fn(), acknowledgeGoogleSubscription: vi.fn() }))
const localUri = 'mongodb://localhost:28018/rentos_compliance_e2e'
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== localUri)('store subscription lifecycle through real Mongo', () => {
  const userId = new mongoose.Types.ObjectId()
  const mappingId = new mongoose.Types.ObjectId()
  const packageId = new mongoose.Types.ObjectId().toString()
  const app = `gh.rentos.lifecycle${userId}`
  const token = `fixture-${userId}`
  let state: Awaited<ReturnType<typeof verifyGoogleSubscription>>
  beforeAll(async () => {
    vi.stubEnv('GOOGLE_PLAY_PUBSUB_SUBSCRIPTION', app)
    vi.stubEnv('STORE_BILLING_ENCRYPTION_KEY', 'a'.repeat(64))
    vi.stubEnv('GOOGLE_PLAY_PACKAGE_NAME', app)
    vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_FILE', '/fixture/not-used.json')
    await mongoose.connect(localUri)
    await StorePurchase.init()
    await StoreNotification.init()
    await StoreProduct.create({ _id: mappingId, platform: 'google', productId: `fixture-${userId}`, basePlanId: 'monthly', packageId, isActive: false, entitlementSnapshot: { planId: packageId, planName: 'Fixture', planVersion: 1, billingCycle: 'monthly', benefits: [], features: { 'property.limit': 8 } } })
    await mongoose.connection.db!.collection('users').insertOne({ _id: userId, email: `${userId}@rentos.test`, storeAccountToken: randomUUID(), roles: ['landlord'] })
    state = { platform: 'google', packageName: app, purchaseTokenHash: purchaseTokenHash(token), state: 'SUBSCRIPTION_STATE_ACTIVE', environment: 'production', acknowledged: false, startedAt: new Date(Date.now() - 86400000).toISOString(), verifiedAt: new Date().toISOString(), linkedPurchaseTokenHash: null,
      items: [{ productId: `fixture-${userId}`, basePlanId: 'monthly', offerId: null, expiresAt: new Date(Date.now() + 86400000).toISOString(), autoRenewing: true, latestOrderId: null, accessEligible: true }],
    }
    vi.mocked(verifyGoogleSubscription).mockImplementation(async () => structuredClone(state))
    vi.mocked(acknowledgeGoogleSubscription).mockResolvedValue(undefined)
  })
  afterAll(async () => {
    await StoreNotification.deleteMany({ subscription: app })
    await StoreProduct.deleteOne({ _id: mappingId })
    await StorePurchase.deleteMany({ applicationId: app })
    await mongoose.connection.db!.collection('users').deleteOne({ _id: userId })
    await mongoose.disconnect()
    vi.unstubAllEnvs()
  })
  async function poll() {
    await StorePurchase.updateOne({ applicationId: app }, { $set: { recoveryNextAttemptAt: new Date(0) } })
    return recoverGooglePurchases(1)
  }
  it('renews acknowledged purchases, removes hold/paused access, restores recovery and stops expired polling', async () => {
    expect(await completeGooglePurchase(userId.toString(), token)).toMatchObject({ acknowledged: true, entitlementState: 'active' })
    expect(acknowledgeGoogleSubscription).toHaveBeenCalledTimes(1)
    state.acknowledged = true
    state.items[0].latestOrderId = 'GPA.current'
    state.items[0].expiresAt = new Date(Date.now() + 31 * 86400000).toISOString()
    expect(await poll()).toMatchObject({ processed: 1, failed: 0 })
    expect((await activeStoreSubscription(userId.toString()))?.expiresAt).toBe(state.items[0].expiresAt)
    expect(acknowledgeGoogleSubscription).toHaveBeenCalledTimes(1)
    state.state = 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
    expect(await poll()).toMatchObject({ processed: 1, failed: 0 })
    expect(await activeStoreSubscription(userId.toString())).not.toBeNull()
    for (const providerState of ['SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_PAUSED'] as const) {
      state.state = providerState
      state.items[0].accessEligible = false
      expect(await poll()).toMatchObject({ processed: 1, failed: 0 })
      expect(await activeStoreSubscription(userId.toString())).toBeNull()
      state.state = 'SUBSCRIPTION_STATE_ACTIVE'
      state.items[0].accessEligible = true
      expect(await poll()).toMatchObject({ processed: 1, failed: 0 })
      expect(await activeStoreSubscription(userId.toString())).not.toBeNull()
    }
    state.state = 'SUBSCRIPTION_STATE_CANCELED'
    expect(await poll()).toMatchObject({ processed: 1, failed: 0 })
    expect(await activeStoreSubscription(userId.toString())).not.toBeNull()
    const refund = (messageId: string, orderId: string) => ({ subscription: app, message: { messageId, data: Buffer.from(JSON.stringify({ version: '1.0', packageName: app, eventTimeMillis: String(Date.now()), voidedPurchaseNotification: { purchaseToken: token, orderId, productType: 1, refundType: 1 } })).toString('base64') } })
    await processGoogleNotification(refund('old-order', 'GPA.old'))
    expect(await activeStoreSubscription(userId.toString())).not.toBeNull()
    vi.mocked(verifyGoogleSubscription).mockRejectedValueOnce(new Error('provider unavailable'))
    await expect(processGoogleNotification(refund('current-order', 'GPA.current'))).rejects.toThrow('provider unavailable')
    // Immediate read-time exclusion applies even before provider refresh succeeds.
    expect(await activeStoreSubscription(userId.toString())).toBeNull()
    await processGoogleNotification(refund('current-order', 'GPA.current'))
    expect(await activeStoreSubscription(userId.toString())).toBeNull()
    const voided = await StorePurchase.findOne({ applicationId: app }).lean()
    expect(voided?.voidedOrderIds).toEqual(['GPA.old', 'GPA.current'])
    state.state = 'SUBSCRIPTION_STATE_ACTIVE'
    state.items[0].latestOrderId = 'GPA.new-renewal'
    expect(await poll()).toMatchObject({ processed: 1, failed: 0 })
    expect(await activeStoreSubscription(userId.toString())).not.toBeNull()
    await processGoogleNotification(refund('delayed-current-order', 'GPA.current'))
    expect(await activeStoreSubscription(userId.toString())).not.toBeNull()
    state.state = 'SUBSCRIPTION_STATE_EXPIRED'
    state.items[0].accessEligible = false
    state.items[0].expiresAt = new Date(Date.now() - 1000).toISOString()
    expect(await poll()).toMatchObject({ processed: 1, failed: 0 })
    expect(await activeStoreSubscription(userId.toString())).toBeNull()
    expect(await poll()).toMatchObject({ processed: 0 })
    expect(acknowledgeGoogleSubscription).toHaveBeenCalledTimes(1)
  // This scenario performs multiple renewal, hold, refund and recovery cycles
  // through real MongoDB; allow its sequential I/O to finish under suite load.
  }, 20_000)
})

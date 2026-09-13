import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'
import { StorePurchase } from '../models/StorePurchase.js'
import { recoverGooglePurchases } from '../services/storeBilling/recoverPurchases.js'
import { completeGooglePurchase } from '../services/storeBilling/completePurchase.js'
import { encryptStoreToken } from '../services/storeBilling/tokenVault.js'
import { storeTokenContext } from '../services/storeBilling/purchaseJournal.js'
import { purchaseTokenHash } from '../services/storeBilling/googlePlay.js'
vi.mock('../services/storeBilling/completePurchase.js', () => ({ completeGooglePurchase: vi.fn() }))
const localUri = 'mongodb://localhost:28018/rentos_compliance_e2e'
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== localUri)('store recovery real-Mongo leases', () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const app = `gh.rentos.recovery${userId}`
  const token = `fixture-${userId}`
  const hash = purchaseTokenHash(token)
  beforeAll(async () => {
    vi.stubEnv('STORE_BILLING_ENCRYPTION_KEY', 'a'.repeat(64))
    vi.stubEnv('GOOGLE_PLAY_PACKAGE_NAME', app)
    vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_FILE', '/fixture/not-used.json')
    await mongoose.connect(localUri)
    await StorePurchase.init()
    await StorePurchase.create({ platform: 'google', applicationId: app, tokenHash: hash, userId, tokenCiphertext: encryptStoreToken(token, storeTokenContext(app, hash, userId)), revision: 1, providerState: 'SUBSCRIPTION_STATE_ACTIVE', environment: 'production', acknowledged: false, verifiedAt: new Date(), items: [], entitlementState: 'pending' })
  })
  afterAll(async () => {
    await StorePurchase.deleteMany({ applicationId: app, userId })
    await mongoose.disconnect()
    vi.unstubAllEnvs()
  })
  it('excludes a live competing worker and retries an expired lease after backoff', async () => {
    let release!: () => void
    let entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    vi.mocked(completeGooglePurchase).mockImplementationOnce(async () => { entered(); await gate; throw new Error('private-provider-failure') })
    const first = recoverGooglePurchases(1)
    await started
    try {
      expect(await recoverGooglePurchases(1)).toMatchObject({ processed: 0 })
    } finally { release() }
    expect(await first).toMatchObject({ processed: 1, failed: 1 })
    const stored = await StorePurchase.findOne({ applicationId: app }).lean()
    expect(stored?.recoveryLastError).toBe('completion_failed')
    expect(stored?.recoveryLeaseId).toBeUndefined()
    expect(stored?.recoveryNextAttemptAt?.getTime()).toBeGreaterThan(Date.now())
    expect(await recoverGooglePurchases(1)).toMatchObject({ processed: 0 })
    await StorePurchase.updateOne({ applicationId: app }, { $set: { recoveryNextAttemptAt: new Date(0), recoveryLeaseId: 'crashed-worker', recoveryLeaseUntil: new Date(0) } })
    vi.mocked(completeGooglePurchase).mockResolvedValueOnce({ purchaseId: 'fixture', revision: 1, purchaseState: 'SUBSCRIPTION_STATE_ACTIVE', entitlementState: 'active', acknowledged: true })
    expect(await recoverGooglePurchases(1)).toMatchObject({ processed: 1, failed: 0 })
    const recovered = await StorePurchase.findOne({ applicationId: app }).lean()
    expect(recovered?.recoveryAttempts).toBe(0)
    expect(recovered?.recoveryLastError).toBeUndefined()
  })
})

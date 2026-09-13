import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'
import { ApplePurchase } from '../models/ApplePurchase.js'
import { recoverApplePurchases } from '../services/storeBilling/recoverApplePurchases.js'
import { completeApplePurchase } from '../services/storeBilling/completeApplePurchase.js'
import { encryptStoreToken } from '../services/storeBilling/tokenVault.js'
import { appleTokenContext, appleTransactionHash } from '../services/storeBilling/applePurchaseJournal.js'
vi.mock('../services/storeBilling/completeApplePurchase.js', () => ({ completeApplePurchase: vi.fn() }))
const localUri = 'mongodb://localhost:28018/rentos_compliance_e2e'
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== localUri)('Apple recovery real-Mongo leases', () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const app = `gh.rentos.recovery${userId}`
  const token = BigInt(`0x${userId}`).toString()
  const hash = appleTransactionHash(token)
  beforeAll(async () => {
    vi.stubEnv('STORE_BILLING_ENCRYPTION_KEY', 'a'.repeat(64))
    vi.stubEnv('APPLE_STORE_BUNDLE_ID', app)
    vi.stubEnv('APPLE_STORE_ENVIRONMENT', 'Production')
    vi.stubEnv('APPLE_STORE_PRIVATE_KEY_FILE', '/fixture/not-used.json')
    await mongoose.connect(localUri)
    await ApplePurchase.init()
    await ApplePurchase.create({ applicationId: app, originalTransactionHash: hash, userId,
      originalTransactionCiphertext: encryptStoreToken(token, appleTokenContext(app, 'production', hash, userId)),
      revision: 1, transactionHash: appleTransactionHash('123456'), providerStatus: 1, environment: 'production', productId: 'fixture', subscriptionGroupId: 'group',
      purchasedAt: new Date(), originalPurchasedAt: new Date(), expiresAt: new Date(Date.now() + 86400000), signedAt: new Date(), verifiedAt: new Date(),
      upgraded: false, autoRenewing: true, accessEligible: true, accessExpiresAt: new Date(Date.now() + 86400000), entitlementState: 'pending' })
  })
  afterAll(async () => {
    await ApplePurchase.deleteMany({ applicationId: app, userId })
    await mongoose.disconnect()
    vi.unstubAllEnvs()
  })
  it('excludes a live competing worker and retries an expired lease after backoff', async () => {
    let release!: () => void
    let entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    vi.mocked(completeApplePurchase).mockImplementationOnce(async () => { entered(); await gate; throw new Error('private-provider-failure') })
    const first = recoverApplePurchases(1)
    await started
    try {
      expect(await recoverApplePurchases(1)).toMatchObject({ processed: 0 })
    } finally { release() }
    expect(await first).toMatchObject({ processed: 1, failed: 1 })
    const stored = await ApplePurchase.findOne({ applicationId: app }).lean()
    expect(stored?.recoveryLastError).toBe('completion_failed')
    expect(stored?.recoveryLeaseId).toBeUndefined()
    expect(stored?.recoveryNextAttemptAt?.getTime()).toBeGreaterThan(Date.now())
    expect(await recoverApplePurchases(1)).toMatchObject({ processed: 0 })
    await ApplePurchase.updateOne({ applicationId: app }, { $set: { recoveryNextAttemptAt: new Date(0), recoveryLeaseId: 'crashed-worker', recoveryLeaseUntil: new Date(0) } })
    vi.mocked(completeApplePurchase).mockResolvedValueOnce({ purchaseId: 'fixture', revision: 1, purchaseState: 1, entitlementState: 'active' })
    expect(await recoverApplePurchases(1)).toMatchObject({ processed: 1, failed: 0 })
    const recovered = await ApplePurchase.findOne({ applicationId: app }).lean()
    expect(recovered?.recoveryAttempts).toBe(0)
    expect(recovered?.recoveryLastError).toBeUndefined()
  })
  it('rejects corrupted recovery identifiers before any provider call', async () => {
    vi.mocked(completeApplePurchase).mockClear()
    await ApplePurchase.updateOne({ applicationId: app }, { $set: { recoveryNextAttemptAt: new Date(0), originalTransactionCiphertext: encryptStoreToken('999', appleTokenContext(app, 'production', hash, userId)) } })
    expect(await recoverApplePurchases(1)).toMatchObject({ processed: 1, failed: 1 })
    expect(completeApplePurchase).not.toHaveBeenCalled()
    const saved = await ApplePurchase.findOne({ applicationId: app }).lean()
    expect(saved?.recoveryLastError).toBe('completion_failed')
    await ApplePurchase.updateOne({ applicationId: app }, { $set: { originalTransactionCiphertext: encryptStoreToken(token, appleTokenContext(app, 'production', hash, userId)) } })
  })
  it('polls billing retry but leaves fully processed expired and revoked chains alone', async () => {
    for (const providerStatus of [2, 5]) {
      await ApplePurchase.updateOne({ applicationId: app }, { $set: { recoveryNextAttemptAt: new Date(0), entitlementState: 'revoked', providerStatus } })
      expect(await recoverApplePurchases(1)).toMatchObject({ processed: 0 })
    }
    await ApplePurchase.updateOne({ applicationId: app }, { $set: { providerStatus: 3 } })
    vi.mocked(completeApplePurchase).mockResolvedValue({ purchaseId: 'fixture', revision: 2, purchaseState: 3, entitlementState: 'revoked' })
    expect(await recoverApplePurchases(1)).toMatchObject({ processed: 1, failed: 0 })
    expect(completeApplePurchase).toHaveBeenLastCalledWith(userId, token)
  })
  it('does not query sandbox purchases in production or accept unbounded batches', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('APPLE_STORE_ENVIRONMENT', 'Sandbox')
    try { expect(await recoverApplePurchases(1)).toEqual({ processed: 0, failed: 0, skipped: true }) }
    finally { vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('APPLE_STORE_ENVIRONMENT', 'Production') }
    await expect(recoverApplePurchases(101)).rejects.toThrow('Invalid recovery batch size')
  })

  it('cannot release or overwrite the state of a replacement lease holder', async () => {
    await ApplePurchase.updateOne({ applicationId: app }, { $set: { recoveryNextAttemptAt: new Date(0), entitlementState: 'pending' } })
    vi.mocked(completeApplePurchase).mockImplementationOnce(async () => {
      await ApplePurchase.updateOne({ applicationId: app }, { $set: { recoveryLeaseId: 'replacement-worker', recoveryLeaseUntil: new Date(Date.now() + 300000), recoveryLastError: 'replacement-state' } })
      return { purchaseId: 'fixture', revision: 3, purchaseState: 1, entitlementState: 'active' }
    })
    expect(await recoverApplePurchases(1)).toMatchObject({ processed: 1, failed: 0 })
    expect(await ApplePurchase.findOne({ applicationId: app }).lean()).toMatchObject({ recoveryLeaseId: 'replacement-worker', recoveryLastError: 'replacement-state' })
  })

})

import { AppleTransactionRevocation } from '../models/AppleTransactionRevocation.js'
import { recordAppleRevocation } from '../services/storeBilling/appleRevocations.js'
import { processAppleNotification } from '../services/storeBilling/appleNotifications.js'
import { StoreNotification } from '../models/StoreNotification.js'
import { recoverApplePurchases } from '../services/storeBilling/recoverApplePurchases.js'
import { completeApplePurchase } from '../services/storeBilling/completeApplePurchase.js'
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { StoreProduct } from '../models/StoreProduct.js'
import { prepareAppleEntitlements, activateAppleEntitlements, activeAppleSubscription } from '../services/storeBilling/appleEntitlements.js'
import { resolveEntitlements } from '../services/entitlements.js'
import { effectiveStoreSubscription } from '../services/storeBilling/activeEntitlements.js'
import { ApplePurchase } from '../models/ApplePurchase.js'
import { recordApplePurchase, appleTransactionHash, appleTokenContext } from '../services/storeBilling/applePurchaseJournal.js'
import { StorePurchaseConflict } from '../services/storeBilling/purchaseJournal.js'
import { verifyAppleTransaction, verifyAppleSubscription, verifyAppleNotification } from '../services/storeBilling/appleStore.js'
import { decryptStoreToken } from '../services/storeBilling/tokenVault.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../services/storeBilling/appleStore.js', async original => ({ ...await original<object>(), verifyAppleTransaction: vi.fn(), verifyAppleSubscription: vi.fn(), verifyAppleNotification: vi.fn() }))
const localUri = testMongoUri
describe.skipIf(!hasTestMongo)('Apple journal real-Mongo ownership and concurrency', () => {
  const userId = new mongoose.Types.ObjectId()
  const otherId = new mongoose.Types.ObjectId()
  const originalId = BigInt(`0x${userId}`).toString()
  const app = `gh.rentos.apple${userId}`
  const mappingId = new mongoose.Types.ObjectId()
  const packageId = new mongoose.Types.ObjectId().toString()
  const productId = `fixture-${userId}`
  function facts(): Awaited<ReturnType<typeof verifyAppleTransaction>> {
    return { platform: 'apple', applicationId: app, environment: 'production', transactionId: '123456', originalTransactionId: originalId,
      productId, subscriptionGroupId: 'group', purchasedAt: '2026-09-01T00:00:00Z', originalPurchasedAt: '2026-08-01T00:00:00Z',
      expiresAt: '2027-10-01T00:00:00Z', signedAt: '2026-09-13T00:00:00Z', verifiedAt: new Date().toISOString(), revokedAt: null, upgraded: false }
  }
  function observation(): Awaited<ReturnType<typeof verifyAppleSubscription>> {
    return { ...facts(), transactionId: '123457', status: 1, autoRenewing: true, graceExpiresAt: null, accessExpiresAt: facts().expiresAt, accessEligible: true }
  }
  beforeAll(async () => {
    vi.stubEnv('STORE_BILLING_ENCRYPTION_KEY', 'a'.repeat(64))
    vi.stubEnv('APPLE_STORE_BUNDLE_ID', app)
    vi.stubEnv('APPLE_STORE_PRIVATE_KEY_FILE', '/fixture/not-used.p8')
    vi.stubEnv('APPLE_STORE_ENVIRONMENT', 'Production')
    await mongoose.connect(localUri)
    await ApplePurchase.init()
    await StoreNotification.init()
    await AppleTransactionRevocation.init()
    await StoreProduct.create({ _id: mappingId, platform: 'apple', productId, packageId, isActive: false, entitlementSnapshot: { planId: packageId, planName: 'Apple fixture', planVersion: 1, billingCycle: 'monthly', benefits: [], features: { 'property.limit': 8 } } })
    await mongoose.connection.db!.collection('users').insertMany([userId, otherId].map(_id => ({ _id, email: `${_id}@rentos.test`, storeAccountToken: randomUUID(), roles: ['landlord'] })))
  })
  beforeEach(async () => {
    vi.clearAllMocks()
    await AppleTransactionRevocation.deleteMany({ applicationId: app })
    await ApplePurchase.deleteMany({ userId: { $in: [userId.toString(), otherId.toString()] } })
    await mongoose.connection.db!.collection('users').updateOne({ _id: userId }, { $unset: { deletedAt: 1, suspendedAt: 1 } })
    vi.mocked(verifyAppleTransaction).mockResolvedValue(facts())
    vi.mocked(verifyAppleSubscription).mockResolvedValue(observation())
  })
  afterAll(async () => {
    await ApplePurchase.deleteMany({ userId: { $in: [userId.toString(), otherId.toString()] } })
    await mongoose.connection.db!.collection('users').deleteMany({ _id: { $in: [userId, otherId] } })
    await AppleTransactionRevocation.deleteMany({ applicationId: app })
    await StoreProduct.deleteOne({ _id: mappingId })
    await StoreNotification.deleteMany({ subscription: JSON.stringify(['apple', app, 'production']) })
    await mongoose.disconnect(); vi.unstubAllEnvs()
  })
  it('encrypts the recovery identifier and restores renewals into one original-chain record', async () => {
    const first = await recordApplePurchase(userId.toString(), '123456')
    expect(first).toMatchObject({ revision: 1, transactionHash: appleTransactionHash('123457'), accessEligible: true, entitlementState: 'pending' })
    expect(first).not.toHaveProperty('originalTransactionCiphertext')
    expect(JSON.stringify(first)).not.toContain(originalId)
    const privateRecord = await ApplePurchase.findById(first!._id).select('+originalTransactionCiphertext').lean()
    const context = appleTokenContext(app, 'production', appleTransactionHash(originalId), userId.toString())
    expect(decryptStoreToken(privateRecord!.originalTransactionCiphertext, context)).toBe(originalId)
    expect(() => decryptStoreToken(privateRecord!.originalTransactionCiphertext, appleTokenContext(app, 'test', appleTransactionHash(originalId), userId.toString()))).toThrow()
    vi.mocked(verifyAppleSubscription).mockResolvedValue({ ...observation(), status: 5, accessEligible: false, revokedAt: new Date().toISOString() })
    const second = await recordApplePurchase(userId.toString(), '123457')
    expect(second).toMatchObject({ revision: 2, providerStatus: 5, accessEligible: false, entitlementState: 'pending' })
    expect(second!._id.toString()).toBe(first!._id.toString())
    expect(await ApplePurchase.countDocuments({ userId: userId.toString() })).toBe(1)
  })
  it('retains immutable ownership even if the provider later reports a different account binding', async () => {
    await recordApplePurchase(userId.toString(), '123456')
    vi.mocked(verifyAppleSubscription).mockClear()
    await expect(recordApplePurchase(otherId.toString(), '123457')).rejects.toThrow('another account')
    expect(verifyAppleSubscription).not.toHaveBeenCalled()
  })
  it('fences simultaneous first claims and concurrent updates, requiring fresh verification', async () => {
    async function race() {
      let arrivals = 0
      let release = () => {}
      const barrier = new Promise<void>(resolve => { release = resolve })
      vi.mocked(verifyAppleSubscription).mockImplementation(async () => { if (++arrivals === 2) release(); await barrier; return observation() })
      const results = await Promise.allSettled([recordApplePurchase(userId.toString(), '123456'), recordApplePurchase(userId.toString(), '123457')])
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
      expect((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(StorePurchaseConflict)
    }
    await race()
    await race()
    expect((await ApplePurchase.findOne({ userId: userId.toString() }).lean())?.revision).toBe(2)
    vi.mocked(verifyAppleSubscription).mockResolvedValue(observation())
    expect((await recordApplePurchase(userId.toString(), '123456'))?.revision).toBe(3)
  })
  it.each(['deletedAt', 'suspendedAt'])('does not persist if %s changes during provider verification', async field => {
    vi.mocked(verifyAppleSubscription).mockImplementation(async () => {
      await mongoose.connection.db!.collection('users').updateOne({ _id: userId }, { $set: { [field]: new Date() } })
      return observation()
    })
    await expect(recordApplePurchase(userId.toString(), '123456')).rejects.toThrow('binding unavailable')
    expect(await ApplePurchase.countDocuments({ userId: userId.toString() })).toBe(0)
  })
  it.each([{ originalTransactionId: '999' }, { applicationId: 'other.app' }, { environment: 'test' as const }, { subscriptionGroupId: 'other' }])('rejects a changed provider identity without persisting it', async change => {
    vi.mocked(verifyAppleSubscription).mockResolvedValue({ ...observation(), ...change })
    await expect(recordApplePurchase(userId.toString(), '123456')).rejects.toThrow('identity changed')
    expect(await ApplePurchase.countDocuments({ userId: userId.toString() })).toBe(0)
  })
  it('preserves the last observation during provider failure', async () => {
    await recordApplePurchase(userId.toString(), '123456')
    vi.mocked(verifyAppleSubscription).mockRejectedValue(new Error('provider_unavailable'))
    await expect(recordApplePurchase(userId.toString(), '123457')).rejects.toThrow('provider_unavailable')
    expect((await ApplePurchase.findOne({ userId: userId.toString() }).lean())?.revision).toBe(1)
  })
  it('restores an inactive mapped product and enforces real plan access, expiry and revocation', async () => {
    const at = new Date('2026-09-14T00:00:00Z')
    const purchase = await recordApplePurchase(userId.toString(), '123456')
    const id = purchase!._id.toString()
    expect(await activeAppleSubscription(userId.toString(), at)).toBeNull()
    await prepareAppleEntitlements(userId.toString(), id, 1, at)
    expect(await activeAppleSubscription(userId.toString(), at)).toBeNull()
    await activateAppleEntitlements(userId.toString(), id, 1, at)
    expect(await activeAppleSubscription(userId.toString(), at)).toMatchObject({ billingSource: 'app_store', snapshot: { features: { 'property.limit': 8 } } })
    expect((await resolveEntitlements(userId.toString())).features['property.limit']).toBe(8)
    expect(await activeAppleSubscription(userId.toString(), new Date(facts().expiresAt))).toBeNull()
    expect(await effectiveStoreSubscription(userId.toString(), { subscriptionPackageId: 'newer', subscriptionStartDate: at, subscriptionEndDate: new Date('2028-01-01') }, at)).toBeNull()
    vi.mocked(verifyAppleSubscription).mockResolvedValue({ ...observation(), status: 5, accessEligible: false })
    const revoked = await recordApplePurchase(userId.toString(), '123457')
    expect(revoked).not.toHaveProperty('preparedRevision')
    expect(revoked).not.toHaveProperty('preparedGrant')
    expect(await activeAppleSubscription(userId.toString(), at)).toBeNull()
    await expect(activateAppleEntitlements(userId.toString(), id, 1, at)).rejects.toBeInstanceOf(StorePurchaseConflict)
    await expect(prepareAppleEntitlements(userId.toString(), id, 1, at)).rejects.toBeInstanceOf(StorePurchaseConflict)
    await prepareAppleEntitlements(userId.toString(), id, 2, at)
    expect((await activateAppleEntitlements(userId.toString(), id, 2, at)).entitlementState).toBe('revoked')
  })
  it('rechecks account eligibility and rejects unmapped products', async () => {
    const purchase = await recordApplePurchase(userId.toString(), '123456')
    const id = purchase!._id.toString()
    await prepareAppleEntitlements(userId.toString(), id, 1)
    await mongoose.connection.db!.collection('users').updateOne({ _id: userId }, { $set: { suspendedAt: new Date() } })
    await expect(activateAppleEntitlements(userId.toString(), id, 1)).rejects.toThrow('not eligible')
    await mongoose.connection.db!.collection('users').updateOne({ _id: userId }, { $unset: { suspendedAt: 1 } })
    vi.mocked(verifyAppleSubscription).mockResolvedValue({ ...observation(), productId: 'unmapped' })
    await recordApplePurchase(userId.toString(), '123457')
    await expect(prepareAppleEntitlements(userId.toString(), id, 2)).rejects.toThrow('no RentOS entitlement mapping')
    expect(await activeAppleSubscription(userId.toString())).toBeNull()
  })

  it('bounds grace access by its signed expiry and isolates configured environments', async () => {
    const at = new Date('2026-09-14T00:00:00Z')
    const graceEnd = '2026-09-15T00:00:00Z'
    vi.mocked(verifyAppleSubscription).mockResolvedValue({ ...observation(), status: 4, expiresAt: '2026-09-13T00:00:00Z', graceExpiresAt: graceEnd, accessExpiresAt: graceEnd })
    const purchase = await recordApplePurchase(userId.toString(), '123456')
    await prepareAppleEntitlements(userId.toString(), purchase!._id.toString(), 1, at)
    await activateAppleEntitlements(userId.toString(), purchase!._id.toString(), 1, at)
    expect((await activeAppleSubscription(userId.toString(), at))?.expiresAt).toBe(new Date(graceEnd).toISOString())
    expect(await activeAppleSubscription(userId.toString(), new Date(graceEnd))).toBeNull()
    vi.stubEnv('APPLE_STORE_ENVIRONMENT', 'Sandbox')
    try {
      expect(await activeAppleSubscription(userId.toString(), at)).toBeNull()
      await expect(activateAppleEntitlements(userId.toString(), purchase!._id.toString(), 1, at)).rejects.toThrow('environment is not eligible')
    } finally { vi.stubEnv('APPLE_STORE_ENVIRONMENT', 'Production') }
  })

  it('recovers a journaled purchase after mapping preparation fails without creating a second chain', async () => {
    const collection = mongoose.connection.db!.collection('storeproducts')
    const mapping = await collection.findOne({ _id: mappingId })
    await collection.updateOne({ _id: mappingId }, { $set: { entitlementSnapshot: { invalid: true } } })
    try {
      await expect(completeApplePurchase(userId.toString(), '123456')).rejects.toThrow('snapshot is invalid')
      expect(await activeAppleSubscription(userId.toString())).toBeNull()
      expect((await ApplePurchase.findOne({ userId: userId.toString() }).lean())?.entitlementState).toBe('pending')
    } finally {
      await collection.updateOne({ _id: mappingId }, { $set: { entitlementSnapshot: mapping!.entitlementSnapshot } })
    }
    expect(await completeApplePurchase(userId.toString(), '123456')).toMatchObject({ revision: 2, entitlementState: 'active' })
    expect(await ApplePurchase.countDocuments({ userId: userId.toString() })).toBe(1)
    expect((await resolveEntitlements(userId.toString())).features['property.limit']).toBe(8)
    expect(await completeApplePurchase(userId.toString(), '123456')).toMatchObject({ revision: 3, entitlementState: 'active' })
    expect(await ApplePurchase.countDocuments({ userId: userId.toString() })).toBe(1)
  })

  it('background recovery re-verifies a pending journal and activates actual plan access', async () => {
    const first = await recordApplePurchase(userId.toString(), '123456')
    expect(first?.entitlementState).toBe('pending')
    expect(await recoverApplePurchases(1)).toMatchObject({ processed: 1, failed: 0 })
    const saved = await ApplePurchase.findById(first!._id).lean()
    expect(saved).toMatchObject({ revision: 2, entitlementState: 'active', recoveryAttempts: 0 })
    expect(saved?.recoveryLeaseId).toBeUndefined()
    expect(verifyAppleSubscription).toHaveBeenLastCalledWith(originalId, expect.any(String))
    expect((await resolveEntitlements(userId.toString())).features['property.limit']).toBe(8)
    expect(await recoverApplePurchases(1)).toMatchObject({ processed: 0 })
  })

  it('reconciles signed lifecycle delivery through actual entitlements and durable deduplication', async () => {
    await completeApplePurchase(userId.toString(), '123456')
    const notificationId = randomUUID()
    vi.mocked(verifyAppleNotification).mockResolvedValue({ notificationId, notificationType: 'REVOKE', subtype: null, applicationId: app, environment: 'production', signedAt: new Date().toISOString(), transaction: { ...facts(), transactionId: '123457' } })
    vi.mocked(verifyAppleSubscription).mockRejectedValueOnce(new Error('provider_unavailable'))
    await expect(processAppleNotification({ signedPayload: 'fixture' })).rejects.toThrow('provider_unavailable')
    expect(await StoreNotification.exists({ messageId: notificationId })).toBeNull()
    expect(await activeAppleSubscription(userId.toString())).toBeNull()
    vi.mocked(verifyAppleSubscription).mockResolvedValue({ ...observation(), status: 5, accessEligible: false })
    await processAppleNotification({ signedPayload: 'fixture' })
    expect(await activeAppleSubscription(userId.toString())).toBeNull()
    expect(await StoreNotification.exists({ messageId: notificationId })).not.toBeNull()
    const calls = vi.mocked(verifyAppleSubscription).mock.calls.length
    await processAppleNotification({ signedPayload: 'fixture' })
    expect(vi.mocked(verifyAppleSubscription).mock.calls).toHaveLength(calls)
    // A later paid renewal is determined from fresh provider state, even when
    // the notification transaction itself is historical.
    vi.mocked(verifyAppleNotification).mockResolvedValue({ notificationId: randomUUID(), notificationType: 'DID_RENEW', subtype: null, applicationId: app, environment: 'production', signedAt: new Date().toISOString(), transaction: facts() })
    vi.mocked(verifyAppleSubscription).mockResolvedValue({ ...observation(), transactionId: '123458' })
    await processAppleNotification({ signedPayload: 'fixture' })
    expect((await resolveEntitlements(userId.toString())).features['property.limit']).toBe(8)
  })

  it('orders signed refunds and reversals atomically and requires fresh verification after reversal', async () => {
    vi.mocked(verifyAppleSubscription).mockImplementation(async () => { await new Promise(resolve => setTimeout(resolve, 2)); return observation() })
    await completeApplePurchase(userId.toString(), '123456')
    function event(notificationType: string, signedAt: string) { return { notificationId: randomUUID(), notificationType, subtype: null, applicationId: app, environment: 'production' as const, signedAt, transaction: { ...facts(), transactionId: '123457' } } }
    const refund = event('REFUND', '2026-09-01T00:00:00Z')
    const reversal = event('REFUND_REVERSED', '2026-09-02T00:00:00Z')
    await Promise.all([recordAppleRevocation(refund), recordAppleRevocation(reversal), recordAppleRevocation(refund)])
    expect(await AppleTransactionRevocation.countDocuments({ applicationId: app })).toBe(1)
    expect(await AppleTransactionRevocation.findOne({ applicationId: app }).lean()).toMatchObject({ revoked: false, signedAt: new Date(reversal.signedAt) })
    expect(await activeAppleSubscription(userId.toString())).toBeNull()
    await completeApplePurchase(userId.toString(), '123456')
    expect(await activeAppleSubscription(userId.toString())).not.toBeNull()
    await recordAppleRevocation(refund)
    expect(await activeAppleSubscription(userId.toString())).not.toBeNull()
    // Equal-time conflicts fail closed regardless of arrival order.
    await recordAppleRevocation(event('REFUND', reversal.signedAt))
    await recordAppleRevocation(reversal)
    expect(await activeAppleSubscription(userId.toString())).toBeNull()
    await completeApplePurchase(userId.toString(), '123456')
    expect(await activeAppleSubscription(userId.toString())).toBeNull()
    const newerReversal = event('REFUND_REVERSED', '2026-09-03T00:00:00Z')
    await recordAppleRevocation(newerReversal)
    await completeApplePurchase(userId.toString(), '123456')
    expect(await activeAppleSubscription(userId.toString())).not.toBeNull()
    // Refunding an older transaction does not remove the later renewal.
    await recordAppleRevocation({ ...event('REFUND', '2026-09-04T00:00:00Z'), transaction: { ...facts(), transactionId: '123456' } })
    expect(await activeAppleSubscription(userId.toString())).not.toBeNull()
  })

})

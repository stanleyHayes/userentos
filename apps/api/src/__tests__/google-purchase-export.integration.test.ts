import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { StorePurchase } from '../models/StorePurchase.js'
import router from '../routes/users.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'
const uri = testMongoUri
describe.skipIf(!hasTestMongo)('Google purchase personal export', () => {
  const owner = String(new mongoose.Types.ObjectId()), outsider = String(new mongoose.Types.ObjectId())
  let server: Server
  beforeAll(async () => {
    await mongoose.connect(uri)
    vi.spyOn(User, 'exists').mockResolvedValue({ _id: new mongoose.Types.ObjectId(owner) })
    const date = new Date('2026-09-01T00:00:00Z')
    await StorePurchase.create([owner, outsider].map(userId => ({
      userId, platform: 'google' as const, applicationId: 'gh.rentos.mobile', environment: 'test' as const,
      tokenHash: `private-hash-${userId}`, tokenCiphertext: `private-ciphertext-${userId}`,
      providerState: 'SUBSCRIPTION_STATE_ACTIVE', acknowledged: true, verifiedAt: date,
      startedAt: date.toISOString(), entitlementState: 'active' as const,
      items: [{ productId: userId === owner ? 'owned-plan' : 'other-plan', basePlanId: 'monthly', latestOrderId: 'OWN-ORDER', expiresAt: '2026-10-01T00:00:00Z', autoRenewing: true, accessEligible: true }],
      recoveryLeaseId: 'private-lease', recoveryLastError: 'private-internal-error', linkedPurchaseTokenHash: 'private-linked-hash',
      preparedGrants: [{ productId: 'owned-plan', basePlanId: 'monthly', mappingId: 'private-mapping', packageId: 'private-package', expiresAt: '2026-10-01T00:00:00Z', snapshot: { internal: 'private-snapshot' } }],
    })))
    // Future/provider fields must not leak through a broad nested items projection.
    await StorePurchase.collection.updateOne({ userId: owner }, { $set: { 'items.0.providerDebug': 'private-nested-debug' } })
    const app = express(); app.use('/api/users', router)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    vi.restoreAllMocks()
    await StorePurchase.deleteMany({ userId: { $in: [owner, outsider] } })
    await mongoose.disconnect()
  })
  it('includes only owned Google purchases without encrypted identifiers or recovery internals', async () => {
    const token = jwt.sign({ userId: owner, roles: ['tenant'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '5m' })
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/users/me/export?userId=${outsider}`, { headers: { Authorization: `Bearer ${token}` } })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json()
    expect(body.data.storePurchases).toHaveLength(1)
    expect(body.data.storePurchases[0]).toMatchObject({ platform: 'google', environment: 'test', entitlementState: 'active', startedAt: '2026-09-01T00:00:00.000Z', items: [{ productId: 'owned-plan', basePlanId: 'monthly', latestOrderId: 'OWN-ORDER', autoRenewing: true, expiresAt: '2026-10-01T00:00:00Z' }] })
    expect(JSON.stringify(body.data.storePurchases)).not.toMatch(/other-plan|private-/)
  })
  it('does not export purchase records without authentication', async () => {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/users/me/export`)
    expect(response.status).toBe(401)
  })
})

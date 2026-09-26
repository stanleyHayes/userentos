import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { ApplePurchase } from '../models/ApplePurchase.js'
import router from '../routes/users.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'
const uri = testMongoUri
describe.skipIf(!hasTestMongo)('Apple purchase personal export', () => {
  const owner = String(new mongoose.Types.ObjectId()), outsider = String(new mongoose.Types.ObjectId())
  let server: Server
  beforeAll(async () => {
    await mongoose.connect(uri)
    vi.spyOn(User, 'exists').mockResolvedValue({ _id: new mongoose.Types.ObjectId(owner) })
    const date = new Date('2026-09-01T00:00:00Z')
    await ApplePurchase.create([owner, outsider].map(userId => ({
      userId, applicationId: 'gh.rentos.mobile', environment: 'test' as const, originalTransactionHash: `private-chain-${userId}`,
      originalTransactionCiphertext: `private-ciphertext-${userId}`, transactionHash: `private-transaction-${userId}`,
      productId: userId === owner ? 'owned-plan' : 'other-plan', subscriptionGroupId: 'rentos-plans', providerStatus: 1,
      purchasedAt: date, originalPurchasedAt: date, expiresAt: new Date('2026-10-01T00:00:00Z'), signedAt: date, verifiedAt: date,
      upgraded: false, autoRenewing: true, accessEligible: true, entitlementState: 'pending' as const,
      recoveryLeaseId: 'private-lease', recoveryLastError: 'private-internal-error',
    })))
    const app = express(); app.use('/api/users', router)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    vi.restoreAllMocks()
    await ApplePurchase.deleteMany({ userId: { $in: [owner, outsider] } })
    await mongoose.disconnect()
  })
  it('includes only owned Apple purchases without encrypted identifiers or recovery internals', async () => {
    const token = jwt.sign({ userId: owner, roles: ['tenant'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '5m' })
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/users/me/export?userId=${outsider}`, { headers: { Authorization: `Bearer ${token}` } })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json()
    expect(body.data.applePurchases).toHaveLength(1)
    expect(body.data.applePurchases[0]).toMatchObject({ productId: 'owned-plan', environment: 'test', autoRenewing: true, entitlementState: 'pending' as const, purchasedAt: '2026-09-01T00:00:00.000Z', expiresAt: '2026-10-01T00:00:00.000Z' })
    expect(JSON.stringify(body.data.applePurchases)).not.toMatch(/other-plan|private-/)
  })
  it('does not export purchase records without authentication', async () => {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/users/me/export`)
    expect(response.status).toBe(401)
  })
})

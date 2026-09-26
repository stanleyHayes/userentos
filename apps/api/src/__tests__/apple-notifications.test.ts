import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
const mocks = vi.hoisted(() => ({ verify: vi.fn(), find: vi.fn(), exists: vi.fn(), create: vi.fn(), complete: vi.fn() }))
vi.mock('../services/storeBilling/appleStore.js', async original => ({ ...await original<object>(), verifyAppleNotification: mocks.verify }))
vi.mock('../models/ApplePurchase.js', () => ({ ApplePurchase: { findOne: mocks.find } }))
vi.mock('../models/StoreNotification.js', () => ({ StoreNotification: { exists: mocks.exists, create: mocks.create } }))
vi.mock('../services/storeBilling/completeApplePurchase.js', () => ({ completeApplePurchase: mocks.complete }))
import router from '../routes/appleNotifications.js'
import { StoreVerificationError } from '../services/storeBilling/googlePlay.js'
let server: Server
let url: string
const event = { notificationId: 'delivery', notificationType: 'DID_RENEW', applicationId: 'gh.rentos.mobile', environment: 'production', transaction: { originalTransactionId: '123400', transactionId: '123456' } }
async function send(body: unknown = { signedPayload: 'private-jws' }) { return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use('/apple', router)
  server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); })
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/apple`
})
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))
beforeEach(() => {
  vi.resetAllMocks()
  mocks.verify.mockResolvedValue(event)
  mocks.find.mockReturnValue({ select: () => ({ lean: async () => ({ userId: 'immutable-owner' }) }) })
  mocks.exists.mockResolvedValue(null)
})
describe('Apple notification HTTP processing', () => {
  it('authenticates signed delivery then reconciles the immutable owner before deduplication', async () => {
    const result = await send()
    expect(result.status).toBe(204)
    expect(result.headers.get('cache-control')).toBe('no-store')
    expect(mocks.verify).toHaveBeenCalledWith('private-jws')
    expect(mocks.complete).toHaveBeenCalledWith('immutable-owner', '123456')
    expect(mocks.create).toHaveBeenCalledWith({ subscription: '["apple","gh.rentos.mobile","production"]', messageId: 'delivery' })
    expect(mocks.complete.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0])
  })
  it('verifies duplicates but does not repeat completed reconciliation', async () => {
    mocks.exists.mockResolvedValue({ _id: 'processed' })
    expect((await send()).status).toBe(204)
    expect(mocks.verify).toHaveBeenCalledOnce()
    expect(mocks.complete).not.toHaveBeenCalled()
  })
  it('durably records test delivery without purchase access', async () => {
    mocks.verify.mockResolvedValue({ ...event, notificationType: 'TEST', transaction: null })
    expect((await send()).status).toBe(204)
    expect(mocks.find).not.toHaveBeenCalled()
    expect(mocks.complete).not.toHaveBeenCalled()
    expect(mocks.create).toHaveBeenCalledOnce()
  })
  it('does not acknowledge unknown owners before device registration', async () => {
    mocks.find.mockReturnValue({ select: () => ({ lean: async () => null }) })
    const result = await send()
    expect(result.status).toBe(503)
    expect(result.headers.get('retry-after')).toBe('30')
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('does not acknowledge unsupported consumption processing', async () => {
    mocks.verify.mockResolvedValue({ ...event, notificationType: 'CONSUMPTION_REQUEST' })
    expect((await send()).status).toBe(503)
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('retries provider failures without marking delivery processed or exposing payloads', async () => {
    mocks.complete.mockRejectedValueOnce(new Error('private-jws and credentials'))
    const result = await send()
    expect(result.status).toBe(503)
    expect(await result.text()).not.toContain('private-jws')
    expect(mocks.create).not.toHaveBeenCalled()
    expect((await send()).status).toBe(204)
    expect(mocks.complete).toHaveBeenCalledTimes(2)
  })
  it('accepts concurrent dedup insert races but retries real persistence failures', async () => {
    mocks.create.mockRejectedValueOnce({ code: 11000 })
    expect((await send()).status).toBe(204)
    mocks.create.mockRejectedValueOnce(new Error('database unavailable'))
    expect((await send()).status).toBe(503)
  })
  it('reconciles a sandbox chain only while its owner is allowlisted, and otherwise acknowledges it', async () => {
    const reviewer = '64f0000000000000000000aa'
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('APPLE_STORE_BUNDLE_ID', 'gh.rentos.mobile')
    vi.stubEnv('APPLE_STORE_ENVIRONMENT', 'Production')
    vi.stubEnv('STORE_SANDBOX_ALLOWED_USER_IDS', reviewer)
    try {
      mocks.verify.mockResolvedValue({ ...event, environment: 'test' })
      mocks.find.mockReturnValue({ select: () => ({ lean: async () => ({ userId: reviewer }) }) })
      expect((await send()).status).toBe(204)
      expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ environment: 'test' }))
      expect(mocks.complete).toHaveBeenCalledWith(reviewer, '123456')
      mocks.complete.mockClear(); mocks.create.mockClear()
      vi.stubEnv('STORE_SANDBOX_ALLOWED_USER_IDS', '')
      expect((await send()).status).toBe(204)
      expect(mocks.complete).not.toHaveBeenCalled()
      expect(mocks.create).toHaveBeenCalledWith({ subscription: '["apple","gh.rentos.mobile","test"]', messageId: 'delivery' })
    } finally { vi.unstubAllEnvs() }
  })
  it('rejects unsigned/client-augmented bodies and invalid signatures', async () => {
    expect((await send({ signedPayload: 'private-jws', userId: 'victim' })).status).toBe(400)
    expect(mocks.verify).not.toHaveBeenCalled()
    mocks.verify.mockRejectedValueOnce(new StoreVerificationError('invalid_purchase'))
    expect((await send()).status).toBe(400)
    mocks.verify.mockRejectedValueOnce(new StoreVerificationError('provider_unavailable'))
    expect((await send()).status).toBe(503)
    expect(mocks.complete).not.toHaveBeenCalled()
  })
})

import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
const mocks = vi.hoisted(() => ({ verify: vi.fn(), exists: vi.fn(), create: vi.fn(), find: vi.fn(), complete: vi.fn(), update: vi.fn() }))
vi.mock('google-auth-library', async original => ({ ...await original<object>(), OAuth2Client: class { verifyIdToken = mocks.verify } }))
vi.mock('../models/StoreNotification.js', () => ({ StoreNotification: { exists: mocks.exists, create: mocks.create } }))
vi.mock('../models/StorePurchase.js', () => ({ StorePurchase: { findOne: mocks.find, updateOne: mocks.update } }))
vi.mock('../services/storeBilling/completePurchase.js', () => ({ completeGooglePurchase: mocks.complete }))
import router from '../routes/googlePlayNotifications.js'
let server: Server
let url: string
const subscription = 'projects/rentos/subscriptions/play'
const email = 'push@rentos.iam.gserviceaccount.com'
const audience = 'https://api.rentos.test/api/webhooks/google-play'
function envelope(notification: object = { subscriptionNotification: { version: '1.0', notificationType: 2, purchaseToken: 'private-token' } }) {
  return { subscription, message: { messageId: 'delivery-1', data: Buffer.from(JSON.stringify({ version: '1.0', packageName: 'gh.rentos.mobile', eventTimeMillis: '1789300000000', ...notification })).toString('base64') } }
}
async function send(body: unknown = envelope(), authorization: string | null = 'Bearer signed-token') {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) }, body: JSON.stringify(body) })
}
beforeAll(async () => {
  const app = express(); app.use(express.json({ limit: '100kb' })); app.use('/', router)
  server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
})
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('GOOGLE_PLAY_PUBSUB_AUDIENCE', audience)
  vi.stubEnv('GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL', email)
  vi.stubEnv('GOOGLE_PLAY_PUBSUB_SUBSCRIPTION', subscription)
  vi.stubEnv('GOOGLE_PLAY_PACKAGE_NAME', 'gh.rentos.mobile')
  mocks.verify.mockResolvedValue({ getPayload: () => ({ email, email_verified: true, iss: 'https://accounts.google.com' }) })
  mocks.exists.mockResolvedValue(null)
  mocks.find.mockReturnValue({ select: () => ({ lean: async () => ({ userId: 'owner' }) }) })
  mocks.complete.mockResolvedValue({ acknowledged: true })
  mocks.create.mockResolvedValue({})
  mocks.update.mockResolvedValue({ matchedCount: 1 })
})
afterEach(() => vi.unstubAllEnvs())
describe('authenticated Google notification endpoint', () => {
  it('verifies the configured audience and completes durable processing before acknowledging delivery', async () => {
    const response = await send()
    expect(response.status).toBe(204)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(mocks.verify).toHaveBeenCalledWith({ idToken: 'signed-token', audience })
    expect(mocks.complete).toHaveBeenCalledWith('owner', 'private-token')
    expect(mocks.create).toHaveBeenCalledWith({ subscription, messageId: 'delivery-1' })
    expect(mocks.create.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.complete.mock.invocationCallOrder[0])
  })
  it('rejects missing authorization without decoding or looking up a purchase', async () => {
    expect((await send(envelope(), null)).status).toBe(401)
    expect(mocks.verify).not.toHaveBeenCalled()
    expect(mocks.find).not.toHaveBeenCalled()
  })
  it.each([
    { email: 'other@rentos.iam.gserviceaccount.com', email_verified: true, iss: 'https://accounts.google.com' },
    { email, email_verified: false, iss: 'https://accounts.google.com' },
    { email, email_verified: true, iss: 'https://attacker.test' },
  ])('rejects a mismatched signed identity', async payload => {
    mocks.verify.mockResolvedValue({ getPayload: () => payload })
    expect((await send()).status).toBe(401)
    expect(mocks.find).not.toHaveBeenCalled()
  })
  it('rejects signature, expiry or audience verification failures without leaking token details', async () => {
    mocks.verify.mockRejectedValue(new Error('private-token invalid signature'))
    const response = await send()
    expect(response.status).toBe(401)
    expect(await response.text()).not.toContain('private-token')
  })
  it('requires explicit Pub/Sub configuration', async () => {
    vi.stubEnv('GOOGLE_PLAY_PUBSUB_AUDIENCE', '')
    expect((await send()).status).toBe(503)
    expect(mocks.verify).not.toHaveBeenCalled()
  })
  it('rejects another subscription, application, malformed payload and mixed notification types', async () => {
    expect((await send({ ...envelope(), subscription: 'projects/other/subscriptions/play' })).status).toBe(403)
    expect((await send(envelope({ packageName: 'other.app', testNotification: { version: '1.0' } }))).status).toBe(403)
    expect((await send({ ...envelope(), message: { messageId: 'delivery', data: 'garbage!' } })).status).toBe(400)
    expect((await send(envelope({ testNotification: { version: '1.0' }, subscriptionNotification: { version: '1.0', notificationType: 2, purchaseToken: 'token' } }))).status).toBe(400)
    expect(mocks.complete).not.toHaveBeenCalled()
  })
  it('accepts a configured test delivery without changing entitlements', async () => {
    expect((await send(envelope({ testNotification: { version: '1.0' } }))).status).toBe(204)
    expect(mocks.complete).not.toHaveBeenCalled()
  })
  it('deduplicates completed deliveries and tolerates a racing completion marker', async () => {
    mocks.exists.mockResolvedValueOnce({ _id: 'done' })
    expect((await send()).status).toBe(204)
    expect(mocks.complete).not.toHaveBeenCalled()
    mocks.create.mockRejectedValueOnce({ code: 11000 })
    expect((await send()).status).toBe(204)
    expect(mocks.complete).toHaveBeenCalledTimes(1)
  })
  it('requests retry for an unknown owner or failed completion and does not mark delivery done', async () => {
    mocks.find.mockReturnValueOnce({ select: () => ({ lean: async () => null }) })
    expect((await send()).status).toBe(503)
    mocks.complete.mockRejectedValueOnce(new Error('private-provider-payload'))
    const response = await send()
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private-provider-payload')
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('persists a full subscription refund before verification and preserves evidence on failure', async () => {
    mocks.complete.mockRejectedValueOnce(new Error('provider failure'))
    expect((await send(envelope({ voidedPurchaseNotification: { purchaseToken: 'token', orderId: 'GPA.refunded', productType: 1, refundType: 1 } }))).status).toBe(503)
    expect(mocks.update.mock.calls[0][1].$addToSet).toEqual({ voidedOrderIds: 'GPA.refunded' })
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.complete.mock.invocationCallOrder[0])
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('does not acknowledge unsupported refund notifications as completed', async () => {
    expect((await send(envelope({ voidedPurchaseNotification: { purchaseToken: 'token', orderId: 'order', productType: 2, refundType: 1 } }))).status).toBe(503)
    expect(mocks.complete).not.toHaveBeenCalled()
  })
})

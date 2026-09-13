import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { config } from '../config/index.js'
const mocks = vi.hoisted(() => ({ exists: vi.fn(), complete: vi.fn() }))
vi.mock('../models/User.js', () => ({ User: { exists: mocks.exists } }))
vi.mock('../services/storeBilling/completePurchase.js', () => ({ completeGooglePurchase: mocks.complete }))
import router from '../routes/storeBilling.js'
import { StorePurchaseAccessError, StorePurchaseConflict } from '../services/storeBilling/purchaseJournal.js'
import { StoreVerificationError } from '../services/storeBilling/googlePlay.js'
let server: Server
let url: string
function session(roles = ['landlord'], purpose = 'session') { return jwt.sign({ userId: 'signed-in-owner', roles, permissions: [], purpose }, config.jwtSecret, { expiresIn: '5m' }) }
async function send(body: unknown = { purchaseToken: 'secret-receipt' }, token: string | null = session()) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })
}
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use('/api/store-billing', router)
  server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/store-billing/google/complete`
})
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))
beforeEach(() => {
  vi.resetAllMocks()
  mocks.exists.mockResolvedValue({ _id: 'signed-in-owner' })
  mocks.complete.mockResolvedValue({ purchaseId: 'journal', revision: 1, purchaseState: 'SUBSCRIPTION_STATE_ACTIVE', entitlementState: 'active', acknowledged: true })
})
describe('authenticated purchase and restore completion API', () => {
  it.each(['landlord', 'property_manager'])('completes purchases using the authenticated %s account', async role => {
    const response = await send(undefined, session([role]))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(mocks.complete).toHaveBeenCalledWith('signed-in-owner', 'secret-receipt')
    const result = await response.json()
    expect(result.data).toEqual({ purchaseId: 'journal', revision: 1, purchaseState: 'SUBSCRIPTION_STATE_ACTIVE', entitlementState: 'active', acknowledged: true })
    expect(JSON.stringify(result)).not.toContain('secret-receipt')
  })
  it('returns a pending provider state without claiming active access or acknowledgement', async () => {
    mocks.complete.mockResolvedValue({ purchaseId: 'journal', revision: 2, purchaseState: 'SUBSCRIPTION_STATE_PENDING', entitlementState: 'revoked', acknowledged: false })
    const response = await send()
    expect(response.status).toBe(200)
    expect((await response.json()).data).toMatchObject({ purchaseState: 'SUBSCRIPTION_STATE_PENDING', entitlementState: 'revoked', acknowledged: false })
  })
  it('rejects unauthenticated and non-session tokens before purchase processing', async () => {
    expect((await send(undefined, null)).status).toBe(401)
    expect((await send(undefined, session(['landlord'], 'password-reset'))).status).toBe(401)
    expect(mocks.complete).not.toHaveBeenCalled()
  })
  it('rejects ineligible roles, deleted accounts and suspended accounts', async () => {
    expect((await send(undefined, session(['tenant']))).status).toBe(403)
    mocks.exists.mockResolvedValue(null)
    expect((await send()).status).toBe(401)
    mocks.exists.mockResolvedValueOnce(null).mockResolvedValueOnce({ _id: 'suspended' })
    expect((await send()).status).toBe(403)
    expect(mocks.complete).not.toHaveBeenCalled()
  })
  it('rejects client-supplied ownership/entitlements and malformed tokens', async () => {
    expect((await send({ purchaseToken: 'token', userId: 'victim', packageId: 'paid' })).status).toBe(400)
    expect((await send({ purchaseToken: ' ' })).status).toBe(400)
    expect((await send({ receipt: { valid: true } })).status).toBe(400)
    expect(mocks.complete).not.toHaveBeenCalled()
  })
  it.each([new StorePurchaseAccessError('ownership'), new StorePurchaseAccessError('account_binding'), new StoreVerificationError('account_mismatch')])('rejects ownership or binding failures without exposing account data', async failure => {
    mocks.complete.mockRejectedValue(failure)
    const response = await send()
    expect(response.status).toBe(403)
    expect(await response.text()).not.toContain('signed-in-owner')
  })
  it.each(['invalid_purchase', 'test_purchase'] as const)('returns a verification rejection for %s', async code => {
    mocks.complete.mockRejectedValue(new StoreVerificationError(code))
    expect((await send()).status).toBe(422)
  })
  it('returns a short retry for concurrent observations', async () => {
    mocks.complete.mockRejectedValue(new StorePurchaseConflict())
    const response = await send()
    expect(response.status).toBe(409)
    expect(response.headers.get('retry-after')).toBe('1')
  })
  it('preserves an ambiguous provider failure as retryable and never leaks raw error content', async () => {
    mocks.complete.mockRejectedValue(new Error('secret-receipt and credentials'))
    const response = await send()
    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('30')
    const text = await response.text()
    expect(text).toContain('do not purchase again')
    expect(text).not.toContain('secret-receipt')
  })
})

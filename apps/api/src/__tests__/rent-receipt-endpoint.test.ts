import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { config } from '../config/index.js'
const mocks = vi.hoisted(() => ({ exists: vi.fn(), issue: vi.fn(), read: vi.fn() }))
vi.mock('../models/User.js', () => ({ User: { exists: mocks.exists } }))
vi.mock('../services/payments/rentReceipt.js', async original => ({ ...await original<typeof import('../services/payments/rentReceipt.js')>(), issueRentReceipt: mocks.issue, readRentReceipt: mocks.read }))
import router from '../routes/payments.js'
import { RentReceiptError } from '../services/payments/rentReceipt.js'
let server: Server
let url: string
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use('/api/payments', router)
  server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/payments/507f1f77bcf86cd799439011/receipt`
})
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))
beforeEach(() => { vi.resetAllMocks(); mocks.exists.mockResolvedValue({ _id: 'owner' }); mocks.issue.mockResolvedValue({ receipt: { number: 'fixture' }, paymentStatus: 'completed' }) })
const token = () => jwt.sign({ userId: 'owner', roles: ['tenant'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '5m' })
function send(auth: string | null = token()) { return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify({ userId: 'spoof', amount: 1 }) }) }
it('uses session ownership, ignores client receipt claims and prevents response caching', async () => {
  const response = await send()
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(mocks.issue).toHaveBeenCalledExactlyOnceWith('507f1f77bcf86cd799439011', 'owner')
})
it('rejects unauthenticated receipt issuance before processing', async () => {
  expect((await send(null)).status).toBe(401)
  expect(mocks.issue).not.toHaveBeenCalled()
})
it.each([404, 409] as const)('preserves safe receipt error status %s', async status => {
  mocks.issue.mockRejectedValue(new RentReceiptError(status, 'Safe fixture message'))
  const response = await send()
  expect(response.status).toBe(status)
  expect((await response.json()).error).toBe('Safe fixture message')
})
it('keeps owned receipt access available during suspension', async () => {
  mocks.exists.mockResolvedValueOnce(null).mockResolvedValueOnce({ _id: 'owner' })
  expect((await send()).status).toBe(200)
  expect(mocks.issue).toHaveBeenCalled()
})

it.each([false, true])('serves a private read-only printable copy with suspension=%s', async suspended => {
  if (suspended) mocks.exists.mockResolvedValueOnce(null).mockResolvedValueOnce({ _id: 'owner' })
  mocks.read.mockResolvedValue({ paymentStatus: 'refunded', receipt: { number: 'RNT-fixture', issuedAt: new Date(), paymentReference: 'PAY-fixture', amount: 1000, currency: 'GHS', paidAt: new Date().toISOString(), periodStart: '2026-09-01', periodEnd: '2026-09-30', tenantName: '<script>bad()</script>', landlordName: 'Owner', propertyTitle: 'Unit 1', premisesAddress: 'Accra', furnished: false } })
  const response = await fetch(url + '.html', { headers: { Authorization: `Bearer ${token()}` } })
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('text/html')
  expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
  expect(response.headers.get('cache-control')).toBe('no-store')
  const html = await response.text()
  expect(html).toContain('Payment refunded')
  expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;')
  expect(html).not.toContain('<script>')
  expect(mocks.issue).not.toHaveBeenCalled()
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith('507f1f77bcf86cd799439011', 'owner')
})

it('rejects unauthenticated printable access before reading private records', async () => {
  expect((await fetch(url + '.html')).status).toBe(401)
  expect(mocks.read).not.toHaveBeenCalled()
})

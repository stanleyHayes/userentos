import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import router from '../routes/paymentWebhooks.js'
import { bankTransferProvider } from '../services/payments/bankTransfer.js'
import { finalizePayment } from '../services/payments/finalize.js'
vi.mock('../services/payments/finalize.js', () => ({ finalizePayment: vi.fn() }))
let server: Server, base: string
beforeAll(async () => {
  const app = express(); app.use('/webhooks', router)
  server = await new Promise<Server>(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)) })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(() => { vi.restoreAllMocks(); vi.mocked(finalizePayment).mockReset() })
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(failure => failure ? reject(failure) : resolve())) })
const deliver = () => fetch(`${base}/webhooks/bank`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference: 'PAY-FIXTURE', status: 'success', amount: 100, currency: 'GHS' }) })
it('returns a retryable response on processing failure and forwards the trusted route source', async () => {
  vi.spyOn(bankTransferProvider, 'verifyWebhook').mockReturnValue(true)
  vi.mocked(finalizePayment).mockRejectedValueOnce(new Error('Database unavailable')).mockResolvedValueOnce(false)
  expect((await deliver()).status).toBe(503)
  expect((await deliver()).status).toBe(200)
  expect(finalizePayment).toHaveBeenCalledWith(expect.objectContaining({ reference: 'PAY-FIXTURE' }), { source: 'webhook', providerSource: 'bank_transfer' })
})
it('does not process an unauthenticated callback', async () => {
  vi.spyOn(bankTransferProvider, 'verifyWebhook').mockReturnValue(false)
  expect((await deliver()).status).toBe(401)
  expect(finalizePayment).not.toHaveBeenCalled()
})

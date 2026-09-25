import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import crypto from 'crypto'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { calculateSplit, toMinorUnits } from '../services/marketplace/split.js'
import { MarketplaceTransaction } from '../models/MarketplaceTransaction.js'

const paystack = vi.hoisted(() => ({
  verifyTransaction: vi.fn(),
  initializeSplitTransaction: vi.fn(),
}))

vi.mock('../models/MarketplaceTransaction.js', () => ({
  MarketplaceTransaction: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), create: vi.fn() },
}))
vi.mock('../models/WebhookEvent.js', () => ({
  WebhookEvent: { create: vi.fn().mockResolvedValue({}) },
}))
vi.mock('../services/marketplace/paystack.js', async (orig) => {
  const actual = await orig() as Record<string, unknown>
  return { ...actual, verifyTransaction: paystack.verifyTransaction, initializeSplitTransaction: paystack.initializeSplitTransaction }
})

process.env.PAYSTACK_SECRET_KEY = 'sk_test_marketplace'
const { default: webhookRouter } = await import('../routes/marketplaceWebhooks.js')

function sign(body: string) {
  return crypto.createHmac('sha512', 'sk_test_marketplace').update(body, 'utf8').digest('hex')
}

describe('marketplace split calculation (spec §8.2)', () => {
  it('matches the spec worked examples', () => {
    // Plan A, 5% platform fee on GHS 1,000 -> 50 / 950
    const a = calculateSplit({ grossAmount: 1000, platformFeePercent: 5 })
    expect(a.platformFeeAmount).toBe(50)
    expect(a.sellerExpectedAmount).toBe(950)

    // Plan B, 3% -> 30 / 970
    const b = calculateSplit({ grossAmount: 1000, platformFeePercent: 3 })
    expect(b.platformFeeAmount).toBe(30)
    expect(b.sellerExpectedAmount).toBe(970)
  })

  it('never lets a discount make the payable amount negative (spec §10)', () => {
    const result = calculateSplit({ grossAmount: 100, platformFeePercent: 5, discountAmount: 500 })
    expect(result.payableAmount).toBe(0)
    expect(result.discountAmount).toBe(100)
    expect(result.sellerExpectedAmount).toBeGreaterThanOrEqual(0)
  })

  it('splits the discounted amount, not the list price', () => {
    const result = calculateSplit({ grossAmount: 1000, platformFeePercent: 10, discountAmount: 200 })
    expect(result.payableAmount).toBe(800)
    expect(result.platformFeeAmount).toBe(80)
    expect(result.sellerExpectedAmount).toBe(720)
  })

  it('records who bears the processor fee rather than assuming', () => {
    expect(calculateSplit({ grossAmount: 100, platformFeePercent: 5 }).feeBearer).toBe('platform')
    expect(calculateSplit({ grossAmount: 100, platformFeePercent: 5, feeBearer: 'seller' }).feeBearer).toBe('seller')
  })

  it('rounds to pesewas so fees never drift', () => {
    const result = calculateSplit({ grossAmount: 33.33, platformFeePercent: 7.5 })
    expect(result.platformFeeAmount + result.sellerExpectedAmount).toBe(result.payableAmount)
  })

  it('converts to minor units for the wire', () => {
    expect(toMinorUnits(1000)).toBe(100000)
    expect(toMinorUnits(0.1 + 0.2)).toBe(30)
  })
})

describe('marketplace webhook (spec §8.4)', () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    const app = express()
    app.use('/api/webhooks/marketplace', webhookRouter)
    await new Promise<void>((r) => { server = app.listen(0, () => r()) })
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/webhooks/marketplace`
  })
  afterAll(async () => { await new Promise((r) => server.close(r)) })
  beforeEach(() => vi.clearAllMocks())

  it('rejects an unsigned webhook', async () => {
    const body = JSON.stringify({ event: 'charge.success', data: { reference: 'MKT-1' } })
    const res = await fetch(`${baseUrl}/paystack`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    })
    expect(res.status).toBe(401)
  })

  it('rejects a tampered payload', async () => {
    const body = JSON.stringify({ event: 'charge.success', data: { reference: 'MKT-1' } })
    const res = await fetch(`${baseUrl}/paystack`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-paystack-signature': sign('{"different":true}') },
      body,
    })
    expect(res.status).toBe(401)
  })

  it('accepts a correctly signed webhook', async () => {
    const body = JSON.stringify({ event: 'charge.success', id: 'evt-1', data: { reference: 'MKT-1' } })
    vi.mocked(MarketplaceTransaction.findOne).mockResolvedValue(null as never)

    const res = await fetch(`${baseUrl}/paystack`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-paystack-signature': sign(body) },
      body,
    })
    expect(res.status).toBe(200)
  })

  it('applies a duplicate event only once', async () => {
    const body = JSON.stringify({ event: 'charge.success', id: 'evt-dup', data: { reference: 'MKT-2' } })
    const doc = {
      _id: 'txn-1', reference: 'MKT-2', currency: 'GHS', grossAmount: 1000, discountAmount: 0,
      platformFeeAmount: 50, status: 'pending', providerBound: true, save: vi.fn(),
    }
    vi.mocked(MarketplaceTransaction.findOne).mockResolvedValue(doc as never)
    // First delivery claims the event id; the replay finds it already claimed.
    // The paid transition is the other guarded update.
    let claims = 0
    vi.mocked(MarketplaceTransaction.findOneAndUpdate).mockImplementation((async (filter: Record<string, unknown>) => {
      if ('processedEventIds' in filter) return ++claims === 1 ? { ...doc } : null
      return { ...doc, status: 'paid' }
    }) as never)
    paystack.verifyTransaction.mockResolvedValue({
      status: 'success', amount: 1000, reference: 'MKT-2', currency: 'GHS', fees: 15, metadata: { rentosTransactionId: 'txn-1' }, raw: {},
    })

    const send = () => fetch(`${baseUrl}/paystack`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-paystack-signature': sign(body) },
      body,
    })

    await send()
    await send()
    await new Promise((r) => setTimeout(r, 120))

    // The claim ran for both deliveries, but only the first went on to settle.
    const calls = vi.mocked(MarketplaceTransaction.findOneAndUpdate).mock.calls.map((c) => c[0] as unknown as Record<string, unknown>)
    expect(calls.filter((f) => 'processedEventIds' in f)).toHaveLength(2)
    expect(calls[0]).toMatchObject({ processedEventIds: { $ne: 'evt-dup' } })
    expect(calls.filter((f) => !('processedEventIds' in f))).toEqual([
      { _id: 'txn-1', status: { $in: ['initialized', 'pending'] } },
    ])
  })

  it('refuses to mark paid when server-side verification disagrees', async () => {
    const body = JSON.stringify({ event: 'charge.success', id: 'evt-lie', data: { reference: 'MKT-3' } })
    const doc = { _id: 'txn-3', reference: 'MKT-3', grossAmount: 1000, discountAmount: 0, status: 'pending', save: vi.fn() }
    vi.mocked(MarketplaceTransaction.findOne).mockResolvedValue(doc as never)
    vi.mocked(MarketplaceTransaction.findOneAndUpdate).mockResolvedValue({ ...doc, save: doc.save } as never)
    paystack.verifyTransaction.mockResolvedValue({ status: 'failed', amount: 1000, reference: 'MKT-3', currency: 'GHS', raw: {} })

    await fetch(`${baseUrl}/paystack`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-paystack-signature': sign(body) },
      body,
    })
    await new Promise((r) => setTimeout(r, 120))

    expect(doc.save).not.toHaveBeenCalled()
  })

  it('refuses to mark paid when the provider amount does not match', async () => {
    const body = JSON.stringify({ event: 'charge.success', id: 'evt-amt', data: { reference: 'MKT-4' } })
    const doc = { _id: 'txn-4', reference: 'MKT-4', grossAmount: 1000, discountAmount: 0, status: 'pending', save: vi.fn() }
    vi.mocked(MarketplaceTransaction.findOne).mockResolvedValue(doc as never)
    vi.mocked(MarketplaceTransaction.findOneAndUpdate).mockResolvedValue({ ...doc, save: doc.save } as never)
    paystack.verifyTransaction.mockResolvedValue({ status: 'success', amount: 10, reference: 'MKT-4', currency: 'GHS', raw: {} })

    await fetch(`${baseUrl}/paystack`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-paystack-signature': sign(body) },
      body,
    })
    await new Promise((r) => setTimeout(r, 120))

    expect(doc.save).not.toHaveBeenCalled()
  })
})

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import crypto from 'crypto'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { calculateSplit, toMinorUnits } from '../services/marketplace/split.js'
import { WebhookEvent } from '../models/WebhookEvent.js'

vi.mock('../models/WebhookEvent.js', () => ({
  WebhookEvent: { updateOne: vi.fn(), findOneAndUpdate: vi.fn(), findOne: vi.fn() },
}))

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
    expect(WebhookEvent.updateOne).not.toHaveBeenCalled()
  })

  it('rejects a tampered payload', async () => {
    const body = JSON.stringify({ event: 'charge.success', data: { reference: 'MKT-1' } })
    const res = await fetch(`${baseUrl}/paystack`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-paystack-signature': sign('{"different":true}') },
      body,
    })
    expect(res.status).toBe(401)
    // Nothing unverified is stored or acted on.
    expect(WebhookEvent.updateOne).not.toHaveBeenCalled()
  })

  // Signed charge handling (claiming the event, re-verifying with Paystack,
  // refusing mismatches, applying a duplicate once) runs against a real
  // database in paystack-webhook-dispatch.integration.test.ts: this path is
  // now an alias of the single Paystack webhook.
})

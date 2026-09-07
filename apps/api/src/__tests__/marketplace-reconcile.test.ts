import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WebhookEvent } from '../models/WebhookEvent.js'
import { MarketplaceTransaction } from '../models/MarketplaceTransaction.js'
import {
  retryUnprocessedWebhooks, reconcilePendingTransactions, MAX_WEBHOOK_ATTEMPTS,
} from '../services/marketplace/reconcile.js'

const paystack = vi.hoisted(() => ({ verifyTransaction: vi.fn() }))
vi.mock('../services/marketplace/paystack.js', () => ({ verifyTransaction: paystack.verifyTransaction }))
vi.mock('../models/WebhookEvent.js', () => ({ WebhookEvent: { find: vi.fn(), updateOne: vi.fn() } }))
vi.mock('../models/MarketplaceTransaction.js', () => ({
  MarketplaceTransaction: { find: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn() },
}))

const events = (rows: unknown[]) =>
  vi.mocked(WebhookEvent.find).mockReturnValue({ sort: () => ({ limit: () => rows }) } as never)
const pendingTxns = (rows: unknown[]) =>
  vi.mocked(MarketplaceTransaction.find).mockReturnValue({ sort: () => ({ limit: () => rows }) } as never)

describe('webhook dead-letter retry (spec §8.4)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('only picks up events that were never applied and still have attempts left', async () => {
    events([])
    await retryUnprocessedWebhooks()

    const filter = vi.mocked(WebhookEvent.find).mock.calls[0][0] as unknown as Record<string, unknown>
    // Selection is on "no processedAt", so an event that died BEFORE any
    // bookkeeping ran is still caught — a status column would miss that.
    expect(filter.processedAt).toEqual({ $exists: false })
    expect(filter.attempts).toEqual({ $lt: MAX_WEBHOOK_ATTEMPTS })
  })

  it('recovers a payment whose webhook processing had failed', async () => {
    const event = { eventId: 'evt-1', reference: 'MKT-1', attempts: 1, save: vi.fn() }
    events([event])
    paystack.verifyTransaction.mockResolvedValue({ status: 'success', amount: 1000, fees: 15, reference: 'MKT-1', currency: 'GHS', raw: {} })
    vi.mocked(MarketplaceTransaction.findOne).mockResolvedValue({ _id: 't1', status: 'pending', grossAmount: 1000, discountAmount: 0 } as never)
    vi.mocked(MarketplaceTransaction.findOneAndUpdate).mockResolvedValue({ _id: 't1' } as never)

    const result = await retryUnprocessedWebhooks()

    expect(result.recovered).toBe(1)
    expect(event.attempts).toBe(2)
    expect(event.processedAt).toBeInstanceOf(Date)
  })

  it('claims the event id so a retry cannot apply the same payment twice', async () => {
    const event = { eventId: 'evt-dup', reference: 'MKT-2', attempts: 1, save: vi.fn() }
    events([event])
    paystack.verifyTransaction.mockResolvedValue({ status: 'success', amount: 500, reference: 'MKT-2', currency: 'GHS', raw: {} })
    vi.mocked(MarketplaceTransaction.findOne).mockResolvedValue({ _id: 't2', status: 'pending', grossAmount: 500, discountAmount: 0 } as never)
    vi.mocked(MarketplaceTransaction.findOneAndUpdate).mockResolvedValue(null as never) // already claimed

    const result = await retryUnprocessedWebhooks()

    expect(result.recovered).toBe(0)
    const guard = vi.mocked(MarketplaceTransaction.findOneAndUpdate).mock.calls[0][0] as unknown as Record<string, unknown>
    expect(guard.processedEventIds).toEqual({ $ne: 'evt-dup' })
  })

  it('does not mark paid when the provider still says the payment failed', async () => {
    const event = { eventId: 'evt-3', reference: 'MKT-3', attempts: 1, save: vi.fn() }
    events([event])
    paystack.verifyTransaction.mockResolvedValue({ status: 'failed', amount: 0, reference: 'MKT-3', currency: 'GHS', raw: {} })

    const result = await retryUnprocessedWebhooks()

    expect(result.recovered).toBe(0)
    expect(MarketplaceTransaction.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('records the error and gives up after the attempt ceiling', async () => {
    const event = { eventId: 'evt-4', reference: 'MKT-4', attempts: MAX_WEBHOOK_ATTEMPTS - 1, save: vi.fn() }
    events([event])
    paystack.verifyTransaction.mockRejectedValue(new Error('provider timeout'))

    const result = await retryUnprocessedWebhooks()

    expect(result.exhausted).toBe(1)
    expect(event.processingError).toMatch(/provider timeout/)
    // The row is kept, not deleted — a human can still inspect it.
    expect(event.save).toHaveBeenCalled()
  })

  it('refuses to reconcile when the provider amount disagrees', async () => {
    const event = { eventId: 'evt-5', reference: 'MKT-5', attempts: 1, save: vi.fn() }
    events([event])
    paystack.verifyTransaction.mockResolvedValue({ status: 'success', amount: 10, reference: 'MKT-5', currency: 'GHS', raw: {} })
    vi.mocked(MarketplaceTransaction.findOne).mockResolvedValue({ _id: 't5', status: 'pending', grossAmount: 1000, discountAmount: 0 } as never)

    const result = await retryUnprocessedWebhooks()

    expect(result.recovered).toBe(0)
    expect(event.processingError).toMatch(/amount mismatch/)
    expect(MarketplaceTransaction.findOneAndUpdate).not.toHaveBeenCalled()
  })
})

describe('settlement reconciliation (spec §8.4)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('only examines transactions old enough that a webhook should have arrived', async () => {
    pendingTxns([])
    await reconcilePendingTransactions(30)

    const filter = vi.mocked(MarketplaceTransaction.find).mock.calls[0][0] as unknown as Record<string, unknown>
    expect(filter.status).toEqual({ $in: ['initialized', 'pending'] })
    expect(filter).toHaveProperty('createdAt')
  })

  it('marks a transaction paid when the provider says it succeeded', async () => {
    pendingTxns([{ _id: 't1', reference: 'MKT-9', status: 'pending', grossAmount: 200, discountAmount: 0, save: vi.fn() }])
    paystack.verifyTransaction.mockResolvedValue({ status: 'success', amount: 200, reference: 'MKT-9', currency: 'GHS', raw: {} })
    vi.mocked(MarketplaceTransaction.findOne).mockResolvedValue({ _id: 't1', status: 'pending', grossAmount: 200, discountAmount: 0 } as never)
    vi.mocked(MarketplaceTransaction.findOneAndUpdate).mockResolvedValue({ _id: 't1' } as never)

    expect((await reconcilePendingTransactions()).corrected).toBe(1)
  })

  it('keeps sweeping when one transaction cannot be verified', async () => {
    const ok = { _id: 't2', reference: 'MKT-OK', status: 'pending', grossAmount: 100, discountAmount: 0, save: vi.fn() }
    pendingTxns([{ _id: 't1', reference: 'MKT-BAD', status: 'pending', save: vi.fn() }, ok])
    paystack.verifyTransaction
      .mockRejectedValueOnce(new Error('provider outage'))
      .mockResolvedValueOnce({ status: 'failed', amount: 0, reference: 'MKT-OK', currency: 'GHS', raw: {} })

    const result = await reconcilePendingTransactions()

    // The outage did not abort the sweep; the second transaction was still handled.
    expect(result.examined).toBe(2)
    expect(ok.save).toHaveBeenCalled()
  })
})

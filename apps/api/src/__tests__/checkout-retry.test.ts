import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../models/Payment.js', () => ({ Payment: { updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }) } }))

import { Payment } from '../models/Payment.js'
import { answerRetry, respondCollectionUncertain } from '../services/payments/checkout.js'
import { isPayerCancellable } from '../services/payments/collectionInitiation.js'

const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() })

/*
 * A client keeps a checkout's Idempotency-Key after any error and sends it
 * again on the next identical attempt. What the retry answers decides whether
 * the payer sees the truth: a failed payment used to replay as "Payment
 * already initiated", which the web read as "Subscription activated!".
 */
describe('a checkout retry that finds its earlier payment', () => {
  beforeEach(() => vi.mocked(Payment.updateOne).mockClear())

  it('frees the key of a failed or refunded payment so the retry starts again', async () => {
    for (const status of ['failed', 'refunded']) {
      const res = response()
      expect(await answerRetry(res as never, { _id: 'p1', status, idempotencyKey: 'key-1' })).toBe(false)
      expect(Payment.updateOne).toHaveBeenLastCalledWith({ _id: 'p1', status, idempotencyKey: 'key-1' }, { $unset: { idempotencyKey: 1 } })
      expect(res.status).not.toHaveBeenCalled()
    }
  })

  it('answers a completed payment as completed, with no instructions to follow', async () => {
    const res = response()
    expect(await answerRetry(res as never, { _id: 'p2', status: 'completed', providerInstructions: 'Approve on your phone' }, { fee: { amount: 5 } })).toBe(true)
    expect(res.status).toHaveBeenCalledWith(200)
    const body = res.json.mock.calls[0][0]
    expect(body).toMatchObject({ success: true, message: 'Payment completed', data: { payment: { id: 'p2', status: 'completed' }, fee: { amount: 5 } } })
    expect(body.data.instructions).toBeUndefined()
  })

  it('replays a payment under way with the instructions the payer needs', async () => {
    const res = response()
    expect(await answerRetry(res as never, { _id: 'p3', status: 'processing', providerInstructions: 'Approve the prompt on your phone' })).toBe(true)
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true, message: 'Payment already initiated', data: { instructions: 'Approve the prompt on your phone' } })
  })

  it('answers an interrupted start, which has no instructions, as in progress', async () => {
    const res = response()
    expect(await answerRetry(res as never, { _id: 'p4', status: 'processing' })).toBe(true)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'PAYMENT_IN_PROGRESS', data: { payment: { id: 'p4' } } })
    expect(Payment.updateOne).not.toHaveBeenCalled()
  })
})

describe('a provider that does not answer clearly', () => {
  it('says the payment is being checked: 504 for a timeout, 502 otherwise, never the provider text', () => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
    const res = response()
    respondCollectionUncertain(res as never, { _id: 'p5' }, timeout)
    expect(res.status).toHaveBeenCalledWith(504)
    const other = response()
    respondCollectionUncertain(other as never, { _id: 'p6' }, new Error('Paystack /charge failed (500): PAYSTACK_SECRET_KEY rejected'))
    expect(other.status).toHaveBeenCalledWith(502)
    const body = other.json.mock.calls[0][0]
    expect(body).toMatchObject({ success: false, code: 'PAYMENT_UNCONFIRMED', data: { payment: { id: 'p6' } } })
    expect(JSON.stringify(body)).not.toMatch(/PAYSTACK|Paystack/)
  })
})

describe('which payments the payer may call off', () => {
  const base = { status: 'processing', failureReason: undefined, method: 'mtn_momo' }
  it('never a Paystack charge, even one whose start was interrupted: a late approval would revive it beside a new one', () => {
    expect(isPayerCancellable({ ...base, collectionSource: 'paystack', collectionInitiationUncertainAt: new Date() } as never)).toBe(false)
    expect(isPayerCancellable({ ...base, collectionSource: 'paystack' } as never)).toBe(false)
  })
  it('still an interrupted start on a rail with no status lookup, and a bank transfer', () => {
    expect(isPayerCancellable({ ...base, collectionSource: 'simulated', collectionInitiationUncertainAt: new Date() } as never)).toBe(true)
    expect(isPayerCancellable({ ...base, method: 'bank_transfer', collectionSource: 'bank_transfer' } as never)).toBe(true)
  })
})

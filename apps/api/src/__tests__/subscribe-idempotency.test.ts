import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'
import { subscriptionController } from '../controllers/subscriptionController.js'
import { SubscriptionPackage } from '../models/SubscriptionPackage.js'
import { User } from '../models/User.js'
import { Payment } from '../models/Payment.js'
import { isMethodAvailable } from '../services/payments/index.js'

vi.mock('../models/SubscriptionPackage.js', () => ({
  SubscriptionPackage: { findById: vi.fn(), findOne: vi.fn() },
}))
vi.mock('../models/User.js', () => ({
  User: { findById: vi.fn() },
}))
vi.mock('../models/Payment.js', () => ({
  Payment: { findOne: vi.fn(), create: vi.fn(), updateOne: vi.fn(), findById: vi.fn() },
}))
vi.mock('../models/Property.js', () => ({
  Property: { countDocuments: vi.fn() },
}))
vi.mock('../models/PlanEntitlement.js', () => ({ PlanEntitlement: { find: vi.fn(() => ({ lean: async () => [] })) } }))

const initiateCollection = vi.fn().mockResolvedValue({ providerRef: 'prov-1', status: 'pending', instructions: { ussd: '*170#' } })
vi.mock('../services/payments/index.js', () => ({
  isMethodAvailable: vi.fn(() => true),
  getProvider: vi.fn(() => ({ initiateCollection, source: 'bank_transfer' })),
}))

interface MockResponse {
  statusCode: number
  body: { success: boolean; data?: never; error?: string; message?: string }
  status: (code: number) => MockResponse
  json: (body: unknown) => MockResponse
}

function makeRes(): MockResponse {
  const res: MockResponse = {
    statusCode: 0,
    body: { success: false },
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body as MockResponse['body']
      return this
    },
  }
  return res
}

function makeReq(idempotencyKey?: string): Request {
  return {
    body: { packageId: 'pkg-paid', method: 'bank_transfer' },
    headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {},
    user: { userId: 'u1', email: 'l@example.com', roles: ['landlord'], permissions: [] },
  } as unknown as Request
}

const paidPkg = {
  _id: { toString: () => 'pkg-paid' },
  isActive: true,
  price: 99,
  billingCycle: 'monthly',
  name: 'Pro',
}

const existingPayment = {
  _id: { toString: () => 'pay-existing' },
  reference: 'SUB-EXISTING',
  status: 'pending',
  idempotencyKey: 'key-1',
  tenantId: 'u1',
  purpose: 'subscription',
  method: 'bank_transfer',
  providerInstructions: 'Use the original bank reference',
  purposeMeta: { packageId: 'pkg-paid' },
}

describe('subscriptionController.subscribe idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isMethodAvailable).mockReturnValue(true)
    vi.mocked(Payment.updateOne).mockResolvedValue({ matchedCount: 1 } as never)
    vi.mocked(Payment.findById).mockReturnValue({ lean: async () => ({ _id: 'pay-new', status: 'pending' }) } as never)
    vi.mocked(SubscriptionPackage.findById).mockResolvedValue(paidPkg as never)
    vi.mocked(User.findById).mockResolvedValue({ _id: 'u1' } as never)
  })

  it('rejects an unavailable rail before creating a payment or contacting the provider', async () => {
    vi.mocked(isMethodAvailable).mockReturnValue(false)
    const res = makeRes()
    await subscriptionController.subscribe(makeReq(), res as unknown as Response)
    expect(res.statusCode).toBe(422)
    expect(Payment.create).not.toHaveBeenCalled()
    expect(initiateCollection).not.toHaveBeenCalled()
  })

  it('returns the existing pending payment for a repeated Idempotency-Key', async () => {
    const lean = vi.fn().mockResolvedValue(existingPayment)
    vi.mocked(Payment.findOne).mockReturnValue({ lean } as never)

    const res = makeRes()
    await subscriptionController.subscribe(makeReq('key-1'), res as unknown as Response)

    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe('Payment already initiated')
    expect((res.body.data as unknown as { instructions: string }).instructions).toBe(existingPayment.providerInstructions)
    expect((res.body.data as never as { payment: { id: string } }).payment.id).toBe('pay-existing')
    // The pre-check is scoped to the caller — one user's key never leaks another's payment.
    expect(vi.mocked(Payment.findOne)).toHaveBeenCalledWith({ idempotencyKey: 'key-1', tenantId: 'u1' })
    expect(SubscriptionPackage.findById).not.toHaveBeenCalled()
    expect(vi.mocked(Payment.create)).not.toHaveBeenCalled()
    expect(initiateCollection).not.toHaveBeenCalled()
  })

  it('409s when the Idempotency-Key was already used for a different package', async () => {
    const lean = vi.fn().mockResolvedValue({ ...existingPayment, purposeMeta: { packageId: 'pkg-other' } })
    vi.mocked(Payment.findOne).mockReturnValue({ lean } as never)

    const res = makeRes()
    await subscriptionController.subscribe(makeReq('key-1'), res as unknown as Response)

    expect(res.statusCode).toBe(409)
    expect(vi.mocked(Payment.create)).not.toHaveBeenCalled()
    expect(initiateCollection).not.toHaveBeenCalled()
  })

  it('preserves an uncertain payment when the provider call throws after create', async () => {
    const lean = vi.fn().mockResolvedValue(null)
    vi.mocked(Payment.findOne).mockReturnValue({ lean } as never)
    const created = {
      _id: { toString: () => 'pay-new' },
      status: 'pending',
      failureReason: undefined as string | undefined,
      providerRef: undefined,
      providerStatus: undefined,
      save: vi.fn(async () => undefined),
      toObject: () => ({ _id: 'pay-new', reference: 'SUB-NEW' }),
    }
    vi.mocked(Payment.create).mockResolvedValue(created as never)
    initiateCollection.mockRejectedValueOnce(new Error('provider down'))

    const res = makeRes()
    await expect(subscriptionController.subscribe(makeReq('key-4'), res as unknown as Response)).rejects.toThrow('provider down')

    expect(created.status).toBe('pending')
    expect(created.save).not.toHaveBeenCalled()
    expect(Payment.updateOne).toHaveBeenCalledWith(
      { _id: 'pay-new', status: { $in: ['pending', 'processing'] } },
      { $set: { status: 'processing', collectionInitiationUncertainAt: expect.any(Date) } },
    )
  })

  it('stores the Idempotency-Key on the created payment', async () => {
    const lean = vi.fn().mockResolvedValue(null)
    vi.mocked(Payment.findOne).mockReturnValue({ lean } as never)
    const created = {
      _id: { toString: () => 'pay-new' },
      providerRef: undefined,
      providerStatus: undefined,
      save: vi.fn(async () => undefined),
      toObject: () => ({ _id: 'pay-new', reference: 'SUB-NEW' }),
    }
    vi.mocked(Payment.create).mockResolvedValue(created as never)

    const res = makeRes()
    await subscriptionController.subscribe(makeReq('key-2'), res as unknown as Response)

    expect(res.statusCode).toBe(201)
    expect(vi.mocked(Payment.create)).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'key-2', purpose: 'subscription', collectionSource: 'bank_transfer', subscriptionTerms: expect.objectContaining({ amount: 99, packageId: 'pkg-paid', billingCycle: 'monthly' }) }),
    )
    expect(initiateCollection).toHaveBeenCalledOnce()
  })

  it('resolves the idempotency race (duplicate key error) to the existing payment', async () => {
    const lean = vi.fn()
      .mockResolvedValueOnce(null) // pre-check: nothing there yet
      .mockResolvedValueOnce(existingPayment) // after the 11000: the winner's row
    vi.mocked(Payment.findOne).mockReturnValue({ lean } as never)
    vi.mocked(Payment.create).mockRejectedValue(Object.assign(new Error('duplicate key'), { code: 11000 }))

    const res = makeRes()
    await subscriptionController.subscribe(makeReq('key-3'), res as unknown as Response)

    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe('Payment already initiated')
    expect((res.body.data as unknown as { instructions: string }).instructions).toBe(existingPayment.providerInstructions)
    expect((res.body.data as never as { payment: { id: string } }).payment.id).toBe('pay-existing')
  })
  it.each(['method', 'purpose'])('rejects conflicting %s on a retry', async field => {
    vi.mocked(Payment.findOne).mockReturnValue({ lean: async () => ({ ...existingPayment, [field]: field === 'method' ? 'mtn_momo' : 'rent' }) } as never)
    const res = makeRes()
    await subscriptionController.subscribe(makeReq('key-1'), res as unknown as Response)
    expect(res.statusCode).toBe(409)
    expect(Payment.create).not.toHaveBeenCalled()
  })
  it('rejects a different-package winner of a duplicate-key race', async () => {
    const lean = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ ...existingPayment, purposeMeta: { packageId: 'other' } })
    vi.mocked(Payment.findOne).mockReturnValue({ lean } as never)
    vi.mocked(Payment.create).mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: 11000 }))
    const res = makeRes()
    await subscriptionController.subscribe(makeReq('raced-key'), res as unknown as Response)
    expect(res.statusCode).toBe(409)
  })
})

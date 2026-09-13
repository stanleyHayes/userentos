import { afterEach, expect, it, vi } from 'vitest'
import type { Request, Response } from 'express'
import { rentPeriodError } from '../services/payments/rentPeriod.js'
import { Payment } from '../models/Payment.js'
import { Agreement } from '../models/Agreement.js'
import { paymentController } from '../controllers/paymentController.js'
const provider = vi.hoisted(() => ({ initiate: vi.fn(), capture: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../services/payments/receiptContext.js', () => ({ captureReceiptContext: provider.capture }))
vi.mock('../services/payments/index.js', () => ({ isMethodAvailable: () => true, getProvider: () => ({ initiateCollection: provider.initiate, source: 'simulated' }) }))
const period = { startDate: '2026-09-01', endDate: '2026-09-30' }
const body = { agreementId: 'agreement', method: 'bank_transfer', amount: 1000, rentPeriod: period }
function request(value: unknown = body): Request { return { body: value, headers: {}, user: { userId: 'tenant' } } as unknown as Request }
function response() { return { status: vi.fn().mockReturnThis(), json: vi.fn() } }
afterEach(() => vi.restoreAllMocks())
it.each([
  { startDate: '2026-02-30', endDate: '2026-03-01' },
  { startDate: '2026-09-30', endDate: '2026-09-01' },
  { startDate: '', endDate: '2026-09-30' },
])('rejects invalid period %s', value => { expect(rentPeriodError(value)).not.toBeNull() })
it('supports one-day payments and enforces agreement boundaries', () => {
  expect(rentPeriodError({ startDate: period.startDate, endDate: period.startDate }, period)).toBeNull()
  expect(rentPeriodError(period, { startDate: '2026-09-02', endDate: '2026-09-30' })).not.toBeNull()
  expect(rentPeriodError(period, { startDate: '2026-09-01', endDate: '2026-09-29' })).not.toBeNull()
})
it('requires an explicit period without inferring it from the amount', async () => {
  const res = response()
  await paymentController.create(request({ agreementId: 'agreement', method: 'bank_transfer', amount: 1000 }), res as unknown as Response)
  expect(res.status).toHaveBeenCalledWith(400)
})
it('rejects dates outside the agreement before persisting a payment', async () => {
  vi.spyOn(Agreement, 'findById').mockResolvedValue({ tenantId: 'tenant', startDate: '2026-10-01', endDate: '2027-10-01' } as never)
  const create = vi.spyOn(Payment, 'create')
  const res = response()
  await paymentController.create(request(), res as unknown as Response)
  expect(res.status).toHaveBeenCalledWith(400)
  expect(create).not.toHaveBeenCalled()
})
it('stores the selected period before contacting the collection provider', async () => {
  vi.spyOn(Agreement, 'findById').mockResolvedValue({ tenantId: 'tenant', landlordId: 'owner', propertyId: 'property', rentAmount: 1000, startDate: '2026-01-01', endDate: '2027-01-01' } as never)
  const doc = new Payment({ ...body, tenantId: 'tenant', landlordId: 'owner', reference: 'fixture', status: 'pending' })
  const create = vi.spyOn(Payment, 'create').mockResolvedValue(doc as never)
  vi.spyOn(doc, 'save').mockResolvedValue(doc)
  vi.spyOn(Payment, 'updateOne').mockResolvedValue({ matchedCount: 1 } as never)
  vi.spyOn(Payment, 'findById').mockReturnValue({ lean: async () => doc.toObject() } as never)
  provider.initiate.mockImplementation(async () => {
    expect(provider.capture).toHaveBeenCalledWith(expect.objectContaining({ propertyId: 'property', tenantId: 'tenant', landlordId: 'owner' }))
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ rentPeriod: period, collectionSource: 'simulated' }))
    return { providerRef: 'fixture-provider', status: 'pending' }
  })
  const res = response()
  await paymentController.create(request({ ...body, receiptContext: { tenantName: 'Client-supplied spoof' } }), res as unknown as Response)
  expect(create).toHaveBeenCalledWith(expect.not.objectContaining({ receiptContext: expect.anything() }))
  expect(res.status).toHaveBeenCalledWith(201)
})
it('rejects idempotent replay with a different period', async () => {
  vi.spyOn(Payment, 'findOne').mockReturnValue({ lean: async () => ({ ...body, rentPeriod: { ...period, endDate: '2026-09-29' } }) } as never)
  const req = request(); req.headers['idempotency-key'] = 'fixture'
  const res = response()
  await paymentController.create(req, res as unknown as Response)
  expect(res.status).toHaveBeenCalledWith(409)
})

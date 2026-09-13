import { beforeEach, expect, it, vi } from 'vitest'
import { savingsController } from '../controllers/savingsController.js'
import { Payment } from '../models/Payment.js'
import { isMethodAvailable } from '../services/payments/index.js'
import { recordCollectionInitiation, recordUncertainCollection } from '../services/payments/collectionInitiation.js'

const { initiate } = vi.hoisted(() => ({ initiate: vi.fn() }))
vi.mock('../models/Payment.js', () => ({ Payment: { findOne: vi.fn(), create: vi.fn() } }))
vi.mock('../services/payments/index.js', () => ({ isMethodAvailable: vi.fn(), getProvider: () => ({ source: 'bank_transfer', initiateCollection: initiate }) }))
vi.mock('../services/payments/collectionInitiation.js', () => ({ recordCollectionInitiation: vi.fn(), recordUncertainCollection: vi.fn() }))
const original = { _id: 'original-payment', purpose: 'wallet_deposit', method: 'bank_transfer', amount: 100, providerInstructions: 'Use original reference' }
const request = (body: object = {}) => ({ body: { amount: 100, method: 'bank_transfer', ...body }, headers: { 'idempotency-key': 'original-key' }, user: { userId: 'owner', email: 'owner@rentos.test' } })
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() })
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(Payment.findOne).mockReturnValue({ lean: async () => null } as never)
  vi.mocked(Payment.create).mockResolvedValue({ _id: 'new-payment' } as never)
  vi.mocked(isMethodAvailable).mockReturnValue(true)
  initiate.mockResolvedValue({ providerRef: 'provider', status: 'pending', instructions: 'Transfer once' })
  vi.mocked(recordCollectionInitiation).mockResolvedValue({ _id: 'new-payment', status: 'pending' } as never)
  vi.mocked(recordUncertainCollection).mockResolvedValue(undefined)
})
it('persists the key and source before initiation and records the returned instructions', async () => {
  const res = response()
  await savingsController.deposit(request() as never, res as never)
  expect(Payment.create).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'original-key', collectionSource: 'bank_transfer', purpose: 'wallet_deposit', tenantId: 'owner', amount: 100 }))
  expect(vi.mocked(Payment.create).mock.invocationCallOrder[0]).toBeLessThan(initiate.mock.invocationCallOrder[0])
  expect(recordCollectionInitiation).toHaveBeenCalledWith('new-payment', expect.objectContaining({ instructions: 'Transfer once' }))
  expect(res.status).toHaveBeenCalledWith(201)
})
it('returns the original payment and instructions without requiring the rail to remain available', async () => {
  vi.mocked(Payment.findOne).mockReturnValue({ lean: async () => original } as never)
  vi.mocked(isMethodAvailable).mockReturnValue(false)
  const res = response()
  await savingsController.deposit(request() as never, res as never)
  expect(Payment.findOne).toHaveBeenCalledWith({ idempotencyKey: 'original-key', tenantId: 'owner' })
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ instructions: original.providerInstructions }) }))
  expect(initiate).not.toHaveBeenCalled()
})
it.each([{ amount: 101 }, { method: 'mtn_momo' }, { purpose: 'rent' }])('rejects conflicting stored payment %s', async changes => {
  vi.mocked(Payment.findOne).mockReturnValue({ lean: async () => ({ ...original, ...changes }) } as never)
  const res = response()
  await savingsController.deposit(request() as never, res as never)
  expect(res.status).toHaveBeenCalledWith(409)
  expect(initiate).not.toHaveBeenCalled()
})
it('resolves a duplicate-key creation race without another provider call', async () => {
  const lean = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(original)
  vi.mocked(Payment.findOne).mockReturnValue({ lean } as never)
  vi.mocked(Payment.create).mockRejectedValueOnce(Object.assign(new Error('Duplicate'), { code: 11000 }))
  const res = response()
  await savingsController.deposit(request() as never, res as never)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ payment: expect.objectContaining({ id: 'original-payment' }) }) }))
  expect(initiate).not.toHaveBeenCalled()
})
it('rejects an unavailable rail before creating a record', async () => {
  vi.mocked(isMethodAvailable).mockReturnValue(false)
  const res = response()
  await savingsController.deposit(request() as never, res as never)
  expect(res.status).toHaveBeenCalledWith(422)
  expect(Payment.create).not.toHaveBeenCalled()
})
it('preserves an uncertain initiation without changing it to failed', async () => {
  initiate.mockRejectedValueOnce(new Error('Response lost'))
  await expect(savingsController.deposit(request() as never, response() as never)).rejects.toThrow('Response lost')
  expect(recordUncertainCollection).toHaveBeenCalledWith('new-payment')
})
it.each([0.001, Number.MAX_SAFE_INTEGER])('rejects an uncollectable amount %s before persistence', async amount => {
  const res = response()
  await savingsController.deposit(request({ amount }) as never, res as never)
  expect(res.status).toHaveBeenCalledWith(400)
  expect(Payment.create).not.toHaveBeenCalled()
})

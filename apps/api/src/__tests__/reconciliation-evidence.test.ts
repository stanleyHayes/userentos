import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { reconciliationEvidence } from '../services/payments/reconciliationEvidence.js'
import { makeSimulator } from '../services/payments/simulator.js'
import type { PaymentProvider } from '../services/payments/types.js'
import { Payment } from '../models/Payment.js'
import { finalizePayment } from '../services/payments/finalize.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

const now = new Date('2026-09-13T12:00:00Z')
const facts = { reference: 'PAY-VERIFIED', status: 'completed', amount: 99, currency: 'GHS', paidAt: '2026-09-12T12:00:00Z' }
const payment = { reference: facts.reference, providerRef: facts.reference }
const provider = (data: unknown) => ({ queryCollection: vi.fn().mockResolvedValue(data) }) as unknown as PaymentProvider
it('preserves the observed amount and original paid time', async () => {
  expect(await reconciliationEvidence(provider(facts), payment, now)).toMatchObject({ amount: 99, timestamp: '2026-09-12T12:00:00.000Z', reference: facts.reference })
})
it.each([
  { currency: 'NGN' }, { reference: 'ANOTHER-PAYMENT' }, { amount: NaN }, { amount: 0 },
  { paidAt: undefined }, { paidAt: 'invalid' }, { paidAt: '2026-09-14T12:00:00Z' }, { status: 'pending' },
])('rejects incomplete or mismatched evidence %s', async changes => {
  expect(await reconciliationEvidence(provider({ ...facts, ...changes }), payment, now)).toBeNull()
})
it('never treats status-only adapters or unfamiliar simulator references as settlement evidence', async () => {
  const queryStatus = vi.fn().mockResolvedValue('completed')
  expect(await reconciliationEvidence({ queryStatus } as unknown as PaymentProvider, payment, now)).toBeNull()
  expect(queryStatus).not.toHaveBeenCalled()
  expect(await makeSimulator('mtn_momo').queryStatus('LIVE-REFERENCE')).toBe('pending')
})

const uri = testMongoUri
describe.skipIf(!hasTestMongo)('underpaid reconciliation', () => {
  const ids: mongoose.Types.ObjectId[] = []
  beforeAll(async () => { await mongoose.connect(uri) })
  afterAll(async () => { await Payment.deleteMany({ _id: { $in: ids } }); await mongoose.disconnect() })
  it('does not settle or issue a wallet credit when verified funds are below the expected amount', async () => {
    const id = new mongoose.Types.ObjectId(); ids.push(id)
    const p = await Payment.create({ _id: id, tenantId: String(new mongoose.Types.ObjectId()), landlordId: String(new mongoose.Types.ObjectId()), purpose: 'rent', method: 'mtn_momo', amount: 100, status: 'pending', reference: `PAY-VERIFY-${id}`, providerRef: `PAY-VERIFY-${id}` })
    const event = await reconciliationEvidence(provider({ ...facts, reference: p.reference }), p, now)
    expect(event!.amount).toBe(99)
    expect(await finalizePayment(event!, { source: 'reconciliation' })).toBe(false)
    const saved = await Payment.findById(id).lean()
    expect(saved!.status).toBe('processing')
    expect(saved!.failureReason).toContain('amount_mismatch')
    expect(saved!.walletCreditIntent).toBeUndefined()
    expect(saved!.paidAt).toBeUndefined()
  })
  it.each([NaN, Infinity, -1, 0, 99.99, 100.01])('holds invalid or unequal amounts %s without settlement', async amount => {
    const id = new mongoose.Types.ObjectId(); ids.push(id)
    const p = await Payment.create({ _id: id, tenantId: String(new mongoose.Types.ObjectId()), purpose: 'subscription', method: 'mtn_momo', amount: 100, status: 'pending', reference: `PAY-INVALID-${id}` })
    expect(await finalizePayment({ reference: p.reference, providerRef: 'fixture', status: 'completed', currency: 'GHS', amount, timestamp: now.toISOString(), raw: {} }, { source: 'reconciliation' })).toBe(false)
    expect(await Payment.findById(id).lean()).toMatchObject({ status: 'processing', failureReason: expect.stringContaining('amount_mismatch') })
  })
})

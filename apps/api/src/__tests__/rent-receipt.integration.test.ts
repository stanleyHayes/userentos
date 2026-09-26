import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Payment } from '../models/Payment.js'
import { issueRentReceipt, readRentReceipt } from '../services/payments/rentReceipt.js'
import { recoverRentReceipt } from '../services/payments/recoverRentReceipts.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'
const uri = testMongoUri
describe.skipIf(!hasTestMongo)('durable rent receipt issuance', () => {
  const ids: mongoose.Types.ObjectId[] = []
  beforeAll(async () => { await mongoose.connect(uri) })
  afterAll(async () => { await Payment.deleteMany({ _id: { $in: ids } }); await mongoose.disconnect() })
  async function fixture(extra: Record<string, unknown> = {}) {
    const id = new mongoose.Types.ObjectId(); ids.push(id)
    return Payment.create({ _id: id, agreementId: 'agreement', tenantId: 'tenant', landlordId: 'owner', amount: 1000, method: 'bank_transfer', reference: `receipt-${id}`, purpose: 'rent', status: 'completed', paidAt: '2026-09-13T01:00:00Z', rentPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, receiptContext: { version: 1, capturedAt: new Date('2026-09-12T00:00:00Z'), tenantName: 'Fixture Tenant', landlordName: 'Fixture Owner', propertyId: 'property', propertyTitle: 'Unit 2', premisesAddress: 'Fixture Road, Accra', furnished: false }, ...extra })
  }
  it('issues one durable snapshot for concurrent requests from both parties', async () => {
    const payment = await fixture()
    await expect(readRentReceipt(String(payment._id), 'tenant')).rejects.toMatchObject({ status: 409 })
    expect((await Payment.findById(payment._id).lean())?.rentReceipt).toBeUndefined()
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => issueRentReceipt(String(payment._id), i % 2 ? 'tenant' : 'owner')))
    expect(new Set(results.map(result => result.receipt.number)).size).toBe(1)
    expect(results[0].receipt).toMatchObject({ amount: 1000, currency: 'GHS', periodStart: '2026-09-01', periodEnd: '2026-09-30', tenantName: 'Fixture Tenant', furnished: false })
    await Payment.updateOne({ _id: payment._id }, { $set: { amount: 1200, 'rentReceipt.amount': 99, status: 'refunded' } })
    const historical = await issueRentReceipt(String(payment._id), 'tenant')
    expect(historical.receipt.amount).toBe(1000)
    expect(historical.receipt.number).toBe(results[0].receipt.number)
    expect(historical.paymentStatus).toBe('refunded')
    expect((await readRentReceipt(String(payment._id), 'owner')).paymentStatus).toBe('refunded')
    await expect(readRentReceipt(String(payment._id), 'outsider')).rejects.toMatchObject({ status: 404 })
  })
  it.each(['pending', 'processing', 'failed', 'refunded'])('does not issue a new receipt for %s payments', async status => {
    const payment = await fixture({ status })
    await expect(issueRentReceipt(String(payment._id), 'tenant')).rejects.toMatchObject({ status: 409 })
    expect((await Payment.findById(payment._id).lean())?.rentReceipt).toBeUndefined()
  })
  it('does not disclose or issue receipts to outsiders or for non-rent payments', async () => {
    const payment = await fixture()
    await expect(issueRentReceipt(String(payment._id), 'outsider')).rejects.toMatchObject({ status: 404 })
    const subscription = await fixture({ purpose: 'subscription' })
    await expect(issueRentReceipt(String(subscription._id), 'tenant')).rejects.toMatchObject({ status: 404 })
  })
  it.each(['rentPeriod', 'receiptContext', 'paidAt'])('leaves incomplete historical records unresolved: %s', async field => {
    const payment = await fixture()
    await Payment.collection.updateOne({ _id: payment._id }, { $unset: { [field]: '' } })
    await expect(issueRentReceipt(String(payment._id), 'tenant')).rejects.toMatchObject({ status: 409 })
    expect((await Payment.findById(payment._id).lean())?.rentReceipt).toBeUndefined()
  })
  it('concurrent background recovery and owner requests preserve one issued receipt', async () => {
    const payment = await fixture()
    const results = await Promise.all([recoverRentReceipt(String(payment._id)), recoverRentReceipt(String(payment._id)), issueRentReceipt(String(payment._id), 'tenant')])
    const stored = await Payment.findById(payment._id).lean()
    expect(stored?.rentReceipt?.number).toBe(results[2].receipt.number)
    expect(stored?.receiptIssueClaim).toBeUndefined()
    expect(await recoverRentReceipt(String(payment._id))).toBe('skipped')
  })
  it('defers incomplete details without inventing a receipt and recovers after repair', async () => {
    const payment = await fixture()
    const period = payment.rentPeriod!
    await Payment.collection.updateOne({ _id: payment._id }, { $unset: { rentPeriod: '' } })
    const now = new Date()
    expect(await recoverRentReceipt(String(payment._id), now)).toBe('deferred')
    const deferred = await Payment.findById(payment._id).lean()
    expect(deferred?.rentReceipt).toBeUndefined()
    expect(deferred?.receiptIssueFailure).toBe('details_or_state')
    expect(await recoverRentReceipt(String(payment._id), now)).toBe('skipped')
    await Payment.collection.updateOne({ _id: payment._id }, { $set: { rentPeriod: period } })
    expect(await recoverRentReceipt(String(payment._id), deferred!.receiptIssueNextAttemptAt!)).toBe('issued')
    expect((await Payment.findById(payment._id).lean())?.receiptIssueFailure).toBeUndefined()
  })
  it('a crashed claim blocks competing work until its lease expires', async () => {
    const payment = await fixture()
    const now = new Date()
    const expires = new Date(now.getTime() + 60_000)
    await Payment.updateOne({ _id: payment._id }, { $set: { receiptIssueClaim: 'crashed-worker', receiptIssueNextAttemptAt: expires } })
    expect(await recoverRentReceipt(String(payment._id), now)).toBe('skipped')
    expect(await recoverRentReceipt(String(payment._id), expires)).toBe('issued')
  })
  it('retries transient issuance failures without persisting raw error details', async () => {
    const payment = await fixture()
    const spy = vi.spyOn(Payment, 'findOne').mockReturnValueOnce({ lean: async () => { throw new Error('Private database failure payload') } } as unknown as ReturnType<typeof Payment.findOne>)
    try { expect(await recoverRentReceipt(String(payment._id))).toBe('deferred') } finally { spy.mockRestore() }
    const deferred = await Payment.findById(payment._id).lean()
    expect(deferred?.receiptIssueFailure).toBe('temporary_failure')
    expect(await recoverRentReceipt(String(payment._id), deferred!.receiptIssueNextAttemptAt!)).toBe('issued')
  })
  it.each(['pending', 'failed', 'refunded'])('recovery does not issue for %s records', async status => {
    const payment = await fixture({ status })
    expect(await recoverRentReceipt(String(payment._id))).toBe('skipped')
    expect((await Payment.findById(payment._id).lean())?.rentReceipt).toBeUndefined()
  })
})

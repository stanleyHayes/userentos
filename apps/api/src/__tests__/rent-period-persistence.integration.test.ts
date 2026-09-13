import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Payment } from '../models/Payment.js'
const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('persisted rent period', () => {
  const id = new mongoose.Types.ObjectId()
  beforeAll(async () => { await mongoose.connect(uri) })
  afterAll(async () => { await Payment.deleteOne({ _id: id }); await mongoose.disconnect() })
  it('retains the original allocation under whole-object and nested update attempts', async () => {
    const rentPeriod = { startDate: '2026-09-01', endDate: '2026-09-30' }
    await Payment.create({ _id: id, tenantId: 'fixture', amount: 1000, method: 'bank_transfer', reference: `period-${id}`, rentPeriod })
    await Payment.updateOne({ _id: id }, { $set: { rentPeriod: { startDate: '2026-10-01', endDate: '2026-10-31' } } })
    await Payment.updateOne({ _id: id }, { $set: { 'rentPeriod.endDate': '2026-12-31' } })
    expect((await Payment.findById(id).lean())?.rentPeriod).toEqual(rentPeriod)
  })
})

import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Payment } from '../models/Payment.js'
import { recordCollectionInitiation, recordUncertainCollection } from '../services/payments/collectionInitiation.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

const uri = testMongoUri
describe.skipIf(!hasTestMongo)('collection initiation and webhook ordering', () => {
  const ids: string[] = []
  beforeAll(async () => { await mongoose.connect(uri) })
  afterAll(async () => { await Payment.deleteMany({ _id: { $in: ids } }); await mongoose.disconnect() })
  async function payment(status = 'pending') {
    const id = String(new mongoose.Types.ObjectId()); ids.push(id)
    return Payment.create({ _id: id, tenantId: 'initiation-fixture', reference: `SUB-INIT-${id}`, amount: 99, purpose: 'subscription', method: 'bank_transfer', status })
  }
  it('preserves a completion that arrives before a transport exception', async () => {
    const p = await payment('completed')
    await recordUncertainCollection(String(p._id))
    const saved = await Payment.findById(p._id)
    expect(saved!.status).toBe('completed')
    expect(saved!.failureReason).toBeUndefined()
  })
  it('preserves terminal provider evidence against a late initiation response', async () => {
    const p = await payment('completed')
    await Payment.updateOne({ _id: p._id }, { $set: { providerStatus: 'SUCCESSFUL', providerRef: 'webhook-ref' } })
    const saved = await recordCollectionInitiation(String(p._id), { providerRef: 'init-ref', status: 'pending', instructions: 'Approve' })
    expect(saved).toMatchObject({ status: 'completed', providerStatus: 'SUCCESSFUL', providerRef: 'webhook-ref' })
  })
  it('keeps uncertain attempts nonterminal and persists recoverable instructions', async () => {
    const p = await payment()
    await recordUncertainCollection(String(p._id))
    expect((await Payment.findById(p._id))!.status).toBe('processing')
    const saved = await recordCollectionInitiation(String(p._id), { providerRef: 'original-ref', status: 'pending', instructions: 'Transfer using original reference' })
    expect(saved).toMatchObject({ status: 'processing', providerRef: 'original-ref', providerInstructions: 'Transfer using original reference' })
  })
  it('never rolls back a concurrent terminal transition', async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const p = await payment()
      await Promise.all([
        recordUncertainCollection(String(p._id)),
        Payment.updateOne({ _id: p._id }, { $set: { status: 'completed', providerStatus: 'SUCCESSFUL' }, $unset: { failureReason: 1 } }),
      ])
      expect((await Payment.findById(p._id))!.status).toBe('completed')
    }
  })
})

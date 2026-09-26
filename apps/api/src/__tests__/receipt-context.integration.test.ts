import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { User } from '../models/User.js'
import { Property } from '../models/Property.js'
import { Payment } from '../models/Payment.js'
import { captureReceiptContext } from '../services/payments/receiptContext.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'
const uri = testMongoUri
describe.skipIf(!hasTestMongo)('payment receipt context with real Mongo', () => {
  const tenantId = new mongoose.Types.ObjectId(), landlordId = new mongoose.Types.ObjectId(), propertyId = new mongoose.Types.ObjectId(), paymentId = new mongoose.Types.ObjectId()
  const agreement = { tenantId: String(tenantId), landlordId: String(landlordId), propertyId: String(propertyId) }
  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.collection.insertMany([{ _id: tenantId, firstName: 'Fixture', lastName: 'Tenant', email: `receipt-tenant-${tenantId}@rentos.test` }, { _id: landlordId, firstName: 'Fixture', lastName: 'Owner', email: `receipt-owner-${landlordId}@rentos.test` }])
    await Property.collection.insertOne({ _id: propertyId, title: 'Unit 4', furnished: false, address: { street: '10 Test Road', city: 'Accra', region: 'Greater Accra', digitalAddress: 'GA-000-0000' } })
  })
  afterAll(async () => {
    await Payment.deleteOne({ _id: paymentId }); await Property.deleteOne({ _id: propertyId }); await User.collection.deleteMany({ _id: { $in: [tenantId, landlordId] } }); await mongoose.disconnect()
  })
  it('captures complete server-owned details without treating unfurnished as missing', async () => {
    const context = await captureReceiptContext(agreement)
    expect(context).toMatchObject({ version: 1, tenantName: 'Fixture Tenant', landlordName: 'Fixture Owner', propertyTitle: 'Unit 4', furnished: false, premisesAddress: '10 Test Road, Accra, Greater Accra, GA-000-0000' })
    expect(context?.capturedAt).toBeInstanceOf(Date)
    await Payment.create({ _id: paymentId, tenantId: String(tenantId), landlordId: String(landlordId), amount: 1000, method: 'bank_transfer', reference: `snapshot-${paymentId}`, receiptContext: context })
    await User.collection.updateOne({ _id: tenantId }, { $set: { firstName: 'Changed' } })
    await Property.collection.updateOne({ _id: propertyId }, { $set: { title: 'Changed unit', furnished: true } })
    await Payment.updateOne({ _id: paymentId }, { $set: { 'receiptContext.tenantName': 'Overwritten', 'receiptContext.furnished': true } })
    await Payment.updateOne({ _id: paymentId }, { $set: { receiptContext: { ...context, propertyTitle: 'Overwritten' } } })
    expect((await Payment.findById(paymentId).lean())?.receiptContext).toEqual(context)
  })
  it('does not invent details when a historical property or party is missing', async () => {
    expect(await captureReceiptContext({ ...agreement, propertyId: String(new mongoose.Types.ObjectId()) })).toBeUndefined()
    expect(await captureReceiptContext({ ...agreement, tenantId: String(new mongoose.Types.ObjectId()) })).toBeUndefined()
    expect(await captureReceiptContext({ ...agreement, propertyId: 'legacy-unresolved-reference' })).toBeUndefined()
  })
  it('rejects incomplete premises information rather than using a title as an address', async () => {
    await Property.collection.updateOne({ _id: propertyId }, { $unset: { address: '' } })
    expect(await captureReceiptContext(agreement)).toBeUndefined()
  })
})

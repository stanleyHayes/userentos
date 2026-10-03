import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Notification } from '../models/Notification.js'
import { notifyPropertyApproved, notifyPropertyChangesRequested, notifyPropertyRejected } from '../services/notify.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

/*
 * A review decision told the owner to open /properties, the list, so on
 * mobile they then had to find the listing to see the reviewer's issues and
 * resubmit. Each decision now opens the listing itself.
 */
describe.skipIf(!hasTestMongo)('listing review notifications open the listing', () => {
  const ownerId = String(new mongoose.Types.ObjectId())
  const propertyId = String(new mongoose.Types.ObjectId())
  const latest = async () => (await Notification.findOne({ userId: ownerId }).sort({ createdAt: -1, _id: -1 }).lean())!

  beforeAll(async () => { await mongoose.connect(testMongoUri) })
  afterAll(async () => {
    await Notification.deleteMany({ userId: ownerId })
    await mongoose.disconnect()
  })

  it('links approval, requested changes and rejection to /properties/:id', async () => {
    await notifyPropertyChangesRequested(ownerId, 'Osu flat', propertyId, ['Add a photo of the kitchen'])
    expect(await latest()).toMatchObject({ actionUrl: `/properties/${propertyId}`, message: expect.stringContaining('Add a photo of the kitchen') })
    await notifyPropertyRejected(ownerId, 'Osu flat', propertyId, 'suspected_duplicate')
    expect((await latest()).actionUrl).toBe(`/properties/${propertyId}`)
    await notifyPropertyApproved(ownerId, 'Osu flat', propertyId)
    expect((await latest()).actionUrl).toBe(`/properties/${propertyId}`)
  })
})

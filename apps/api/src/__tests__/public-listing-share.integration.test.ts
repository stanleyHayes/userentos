import mongoose from 'mongoose'
import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Property } from '../models/Property.js'
import { User } from '../models/User.js'
import publicRegistryRouter from '../routes/publicRegistry.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

/*
 * The mobile share sheet links https://userentos.com/registry/<id> for
 * approved and published listings (apps/mobile/lib/listingShare.ts). That
 * public page reads this endpoint while signed out, so an ordinary approved
 * listing must be served, and anything not yet public must not be.
 */
describe.skipIf(!hasTestMongo)('public listing page data for shared links', () => {
  const landlordId = new mongoose.Types.ObjectId()
  const ids: string[] = []
  let server: Server
  let base: string

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await User.collection.insertOne({ _id: landlordId, email: `share-${landlordId}@rentos.test`, roles: ['landlord'], activeRole: 'landlord', verificationStatus: 'verified', passwordHash: 'private-password' })
    const app = express(); app.use(express.json()); app.use('/api/public/properties', publicRegistryRouter)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/public/properties`
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    await Property.deleteMany({ _id: { $in: ids } })
    await User.deleteMany({ _id: landlordId })
    await mongoose.disconnect()
  })

  async function listing(listingStatus: string) {
    const property = await Property.create({ landlordId: String(landlordId), title: `Share ${listingStatus}`, description: 'Fixture', type: 'apartment', address: { street: '3 Share St', city: 'Accra', region: 'Greater Accra' }, rentAmount: 1500, rentDurationMonths: 12, advanceMonths: 1, bedrooms: 2, bathrooms: 1, images: ['https://example.test/photo.jpg'], listingStatus })
    ids.push(String(property._id))
    return String(property._id)
  }

  it('serves an ordinary approved or published listing to a signed-out visitor', async () => {
    for (const status of ['approved', 'published']) {
      const id = await listing(status)
      const response = await fetch(`${base}/${id}`)
      expect(response.status).toBe(200)
      const { data } = await response.json()
      expect(data).toMatchObject({ id, title: `Share ${status}`, city: 'Accra', rentAmount: 1500, bedrooms: 2, listingStatus: status, image: 'https://example.test/photo.jpg', landlordIdentityVerified: true })
      expect(JSON.stringify(data)).not.toContain('3 Share St')
    }
  })

  it('answers not found for a listing that is not public yet', async () => {
    for (const status of ['draft', 'pending_review', 'rejected']) {
      expect((await fetch(`${base}/${await listing(status)}`)).status).toBe(404)
    }
  })
})

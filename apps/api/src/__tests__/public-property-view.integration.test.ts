import mongoose from 'mongoose'
import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Property } from '../models/Property.js'
import router from '../routes/properties.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

const uri = testMongoUri
describe.skipIf(!hasTestMongo)('public property listings', () => {
  const landlordId = String(new mongoose.Types.ObjectId())
  const title = `Published fixture ${landlordId}`
  let server: Server
  let id = ''
  const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/properties`

  beforeAll(async () => {
    await mongoose.connect(uri)
    const inserted = await Property.collection.insertOne({
      landlordId, title, description: 'A published listing', type: 'apartment', status: 'available', listingStatus: 'published',
      address: { street: '1 Fixture Road', city: `Fixtureville-${landlordId}`, region: 'Greater Accra' }, rentAmount: 1000, rentDurationMonths: 12, advanceMonths: 1,
      images: [], videos: [], rules: [], amenities: [], bedrooms: 1, bathrooms: 1, furnished: false, parkingSpaces: 0,
      embedding: [0.1, 0.2, 0.3], reviewedBy: 'staff-reviewer', quotaSlot: 0, reviewIssues: ['internal note'], preferences: { minCreditScore: 0 },
    })
    id = String(inserted.insertedId)
    const app = express(); app.use(express.json()); app.use('/api/properties', router)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    await Property.deleteMany({ landlordId })
    await mongoose.disconnect()
  })

  it('shows a published listing to the public without internal fields', async () => {
    const detail = await fetch(`${base()}/${id}`)
    expect(detail.status).toBe(200)
    const { data } = await detail.json()
    expect(data.title).toBe(title)
    for (const field of ['embedding', 'reviewedBy', 'quotaSlot', 'reviewIssues']) expect(data, field).not.toHaveProperty(field)
    expect(data.preferences).toBeDefined()

    const list = await (await fetch(`${base()}?city=${encodeURIComponent(`Fixtureville-${landlordId}`)}`)).json()
    const item = list.data.items.find((p: { id: string }) => p.id === id)
    expect(item).toBeDefined()
    expect(item).not.toHaveProperty('embedding')
    expect(item).not.toHaveProperty('reviewedBy')
  })
})

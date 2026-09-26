import mongoose from 'mongoose'
import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Property } from '../models/Property.js'
import router from '../routes/properties.js'
import { AI_SHARING_VERSION } from '../middleware/aiConsent.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

// No provider call and no shared cache: the query vector is fixed, and every
// request reads the database.
vi.mock('../services/embeddings.js', async original => ({
  ...await original<typeof import('../services/embeddings.js')>(),
  embed: vi.fn(async () => ({ embedding: [1, 0, 0] })),
}))
vi.mock('../services/cache.js', () => ({ cache: { get: vi.fn(async () => null), set: vi.fn(async () => undefined) } }))

/**
 * An unsuspended listing comes back as 'published' (propertyReview's
 * ACTION_TARGET.unsuspend). It is live in the list, registry and storefronts,
 * so it must be live on the map, in nearby search and in semantic search too.
 */
describe.skipIf(!hasTestMongo)('published listings in map, nearby and semantic search', () => {
  const landlordId = String(new mongoose.Types.ObjectId())
  const city = `Discoverytown-${landlordId}`
  // Open ocean, so no other fixture shares the bounding box.
  const at = { lat: -48.5, lng: -123.4 }
  let server: Server
  const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/properties`
  const titles = (items: { title: string }[]) => items.map((p) => p.title).sort()

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    const listing = (title: string, listingStatus: string) => ({
      landlordId, title, description: 'A listing', type: 'apartment', status: 'available', listingStatus,
      address: { street: '1 Road', city, region: 'Greater Accra' }, rentAmount: 1200, rentDurationMonths: 12, advanceMonths: 1,
      coordinates: at, embedding: [1, 0, 0],
    })
    await Property.collection.insertMany([
      listing('Approved', 'approved'),
      listing('Published', 'published'),
      listing('Pending', 'pending_review'),
      listing('Suspended', 'suspended'),
    ])
    const app = express(); app.use(express.json()); app.use('/api/properties', router)
    server = await new Promise<Server>(r => { const listener = app.listen(0, '127.0.0.1', () => r(listener)) })
  })
  afterAll(async () => {
    if (server) await new Promise<void>(r => server.close(() => r()))
    await Property.deleteMany({ landlordId })
    await mongoose.disconnect()
  })

  it('pins a published listing on the map', async () => {
    const res = await fetch(`${base()}/map/pins?city=${encodeURIComponent(city)}`)
    expect(res.status).toBe(200)
    expect(titles((await res.json()).data.items)).toEqual(['Approved', 'Published'])
  })

  it('finds a published listing nearby', async () => {
    const res = await fetch(`${base()}/nearby?lat=${at.lat}&lng=${at.lng}&radiusKm=1`)
    expect(res.status).toBe(200)
    expect(titles((await res.json()).data.items)).toEqual(['Approved', 'Published'])
  })

  it('returns a published listing from semantic search', async () => {
    const res = await fetch(`${base()}/search/semantic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'two bedroom flat', city, aiSharingConsent: AI_SHARING_VERSION }),
    })
    expect(res.status).toBe(200)
    expect(titles((await res.json()).data.items)).toEqual(['Approved', 'Published'])
  })
})

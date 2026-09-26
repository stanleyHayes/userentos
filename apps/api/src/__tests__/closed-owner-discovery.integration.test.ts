import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

// A fixed vector, identical to the fixtures' stored embeddings, so the
// AI-ranked endpoints rank both fixture listings first without calling OpenAI.
vi.mock('../services/embeddings.js', async (orig) => ({
  ...(await orig() as Record<string, unknown>),
  embed: vi.fn(async () => ({ embedding: [1, 0], model: 'test', dimensions: 2 })),
  embedBatch: vi.fn(async (texts: string[]) => texts.map(() => ({ embedding: [0, 1], model: 'test', dimensions: 2 }))),
}))

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { Property } = await import('../models/Property.js')
const { TenantProfile } = await import('../models/TenantProfile.js')
const { AI_SHARING_VERSION } = await import('../middleware/aiConsent.js')
const { propertyService } = await import('../container.js')
const { errorHandler } = await import('../middleware/errorHandler.js')
const { default: propertiesRouter } = await import('../routes/properties.js')

/*
 * Closing an account withdraws its listings at once. If that step failed part
 * way, every public way of finding a listing must still leave out the closed
 * owner's — not only the main search.
 */
describe.skipIf(!hasTestMongo)("public property discovery leaves out closed accounts' listings", () => {
  const oid = () => new mongoose.Types.ObjectId()
  const [closed, open, viewer] = [oid(), oid(), oid()]
  const [closedProperty, openProperty] = [oid(), oid()]
  const run = String(oid()).slice(-8)
  const city = `Closedowner${run}`
  const at = { lat: 10.4321, lng: -2.9876 }
  let server: Server
  let base = ''
  const viewerToken = () => jwt.sign({ userId: String(viewer), roles: ['tenant'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })
  const ids = (items: Array<{ id?: string; _id?: string }>) => items.map((item) => String(item.id ?? item._id))
  const get = async (path: string, auth = false) => {
    const res = await fetch(`${base}${path}`, { headers: auth ? { Authorization: `Bearer ${viewerToken()}` } : {} })
    expect(res.status, path).toBe(200)
    return (await res.json() as { data: { items: Array<{ id?: string; _id?: string }> } }).data.items
  }

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    const person = (_id: mongoose.Types.ObjectId, extra: Record<string, unknown> = {}) => ({
      _id, email: `closedowner-${String(_id)}@rentos.test`, phone: `0208${String(_id).slice(-6)}`, firstName: 'Owner', lastName: run,
      passwordHash: 'fixture', roles: ['landlord'], activeRole: 'landlord', ...extra,
    })
    // `closed` is a tombstone whose listing take-down never ran.
    await User.collection.insertMany([person(closed, { deletedAt: new Date() }), person(open), person(viewer, { roles: ['tenant'], activeRole: 'tenant' })])
    const listing = (_id: mongoose.Types.ObjectId, landlordId: mongoose.Types.ObjectId) => ({
      _id, landlordId: String(landlordId), title: `Discovery flat ${run}`, description: 'A flat', type: 'apartment', status: 'available', listingStatus: 'approved',
      address: { street: '1 Discovery Rd', city, region: 'Upper West' }, coordinates: at, rentAmount: 1, rentDurationMonths: 12, advanceMonths: 1,
      images: [], embedding: [1, 0], createdAt: new Date(), updatedAt: new Date(),
    })
    await Property.collection.insertMany([listing(closedProperty, closed), listing(openProperty, open)])
    // Preferences that match only the fixtures (rent of 1 in a city of their own).
    await TenantProfile.collection.insertOne({ userId: String(viewer), searchPreferences: { preferredCities: [city], preferredRegions: [], preferredType: [], preferredAmenities: [], minBudget: 0, maxBudget: 1 } })
    const app = express()
    app.use(express.json())
    app.use('/api/properties', propertiesRouter)
    app.use(errorHandler)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Promise.all([
      User.collection.deleteMany({ _id: { $in: [closed, open, viewer] } }),
      Property.collection.deleteMany({ _id: { $in: [closedProperty, openProperty] } }),
      TenantProfile.collection.deleteMany({ userId: String(viewer) }),
    ])
    await mongoose.disconnect()
  })

  const expectOnlyOpen = (found: string[]) => {
    expect(found).toContain(String(openProperty))
    expect(found).not.toContain(String(closedProperty))
  }

  it('nearby', async () => {
    expectOnlyOpen(ids(await get(`/api/properties/nearby?lat=${at.lat}&lng=${at.lng}&radiusKm=1`)))
  })

  it('map pins', async () => {
    expectOnlyOpen(ids(await get(`/api/properties/map/pins?city=${city}`)))
  })

  it('semantic search', async () => {
    const res = await fetch(`${base}/api/properties/search/semantic`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `quiet flat ${run}`, city, aiSharingConsent: AI_SHARING_VERSION }),
    })
    expect(res.status).toBe(200)
    expectOnlyOpen(ids((await res.json() as { data: { items: Array<{ id: string }> } }).data.items))
  })

  it('recommendations for me', async () => {
    expectOnlyOpen(ids(await get('/api/properties/recommendations/for-me', true)))
  })

  it('smart recommendations', async () => {
    expectOnlyOpen(ids(await get('/api/properties/recommendations/smart', true)))
  })

  it("a listing filtered by owner, when that owner's account is closed", async () => {
    const byOwner = (landlordId: mongoose.Types.ObjectId) =>
      propertyService.listProperties({ landlordId: String(landlordId), excludeLandlordIds: [String(closed)], city })
    expect((await byOwner(closed)).items).toEqual([])
    expect((await byOwner(open)).items.map((p) => p.id)).toEqual([String(openProperty)])
  })
})

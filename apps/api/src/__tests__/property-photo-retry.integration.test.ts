import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../utils/cloudinary.js', () => ({ uploadToCloudinary: vi.fn(), deleteFromCloudinary: vi.fn() }))

const { config } = await import('../config/index.js')
const { Property } = await import('../models/Property.js')
const { User } = await import('../models/User.js')
const { uploadToCloudinary, deleteFromCloudinary } = await import('../utils/cloudinary.js')
const { errorHandler } = await import('../middleware/errorHandler.js')
const { default: propertyRouter } = await import('../routes/properties.js')

/*
 * The app uploads listing photos one per request with a 90-second limit. The
 * limit only stops the phone: the server can still finish a slow upload, and
 * "Retry photos" sent it again, so the listing showed the same photo twice.
 * Each photo now carries the app's key, and a key is stored once.
 */
describe.skipIf(!hasTestMongo)('a retried listing photo is stored once', () => {
  const ownerId = new mongoose.Types.ObjectId().toString()
  const propertyId = new mongoose.Types.ObjectId()
  let server: Server
  let base = ''
  let uploads = 0
  const token = jwt.sign({ userId: ownerId, roles: ['landlord'], activeRole: 'landlord', permissions: [], purpose: 'session', sessionVersion: 0 }, config.jwtSecret, { expiresIn: '10m' })
  const send = (uploadKey?: string, files = 1) => {
    const form = new FormData()
    for (let i = 0; i < files; i++) form.append('images', new Blob([new Uint8Array([255, 216, 255, i])], { type: 'image/jpeg' }), `photo-${i}.jpg`)
    if (uploadKey !== undefined) form.append('uploadKey', uploadKey)
    return fetch(`${base}/api/properties/${propertyId}/images`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
  }
  const listing = async () => (await Property.findById(propertyId).select('images imageAssets').lean())!

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await User.create({ _id: ownerId, email: `photo-retry-${ownerId}@example.test`, phone: 'fixture', firstName: 'Photo', lastName: 'Fixture', passwordHash: 'fixture', roles: ['landlord'], activeRole: 'landlord' })
    const app = express(); app.use(express.json())
    app.use('/api/properties', propertyRouter)
    app.use(errorHandler)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  beforeEach(async () => {
    vi.clearAllMocks()
    uploads = 0
    vi.mocked(uploadToCloudinary).mockImplementation(async () => { uploads++; return { url: `https://res.cloudinary.com/rentos-test/image/upload/rentos/properties/p${uploads}.jpg`, publicId: `rentos/properties/p${uploads}`, format: 'jpg', bytes: 4 } })
    vi.mocked(deleteFromCloudinary).mockResolvedValue({ result: 'ok' })
    await Property.deleteOne({ _id: propertyId })
    await Property.collection.insertOne({
      _id: propertyId, landlordId: ownerId, title: 'Photo retry', description: 'Fixture', type: 'apartment', status: 'available', listingStatus: 'draft',
      address: { street: '1 Retry Road', city: 'Accra', region: 'Greater Accra' }, rentAmount: 1000, rentDurationMonths: 12, advanceMonths: 1,
      images: [], imageAssets: [], videos: [], rules: [], amenities: [], bedrooms: 1, bathrooms: 1, furnished: false, parkingSpaces: 0,
    })
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    await Promise.all([Property.deleteOne({ _id: propertyId }), User.deleteOne({ _id: ownerId })])
    await mongoose.disconnect()
  })

  it('sending a photo again with its key stores nothing new and answers with the listing photos', async () => {
    const first = await send('0b9f3c1e-5d7a-4c2b-9e8f-1a2b3c4d5e6f')
    expect(first.status).toBe(200)
    const again = await send('0b9f3c1e-5d7a-4c2b-9e8f-1a2b3c4d5e6f')
    expect(again.status).toBe(200)
    expect((await again.json()).data.images).toHaveLength(1)
    expect(uploads).toBe(1)
    const stored = await listing()
    expect(stored.images).toHaveLength(1)
    expect(stored.imageAssets).toEqual([expect.objectContaining({ publicId: 'rentos/properties/p1', uploadKey: '0b9f3c1e-5d7a-4c2b-9e8f-1a2b3c4d5e6f' })])
  })

  it('two copies of one upload in flight together are stored once, and the extra file is deleted', async () => {
    const releases: Array<() => void> = []
    vi.mocked(uploadToCloudinary).mockImplementation(() => new Promise(resolve => {
      const n = ++uploads
      releases.push(() => resolve({ url: `https://res.cloudinary.com/rentos-test/image/upload/rentos/properties/p${n}.jpg`, publicId: `rentos/properties/p${n}`, format: 'jpg', bytes: 4 }))
    }))
    const timedOut = send('key-in-flight-1')
    const retried = send('key-in-flight-1')
    await expect.poll(() => releases.length).toBe(2)
    releases[0](); releases[1]()
    expect((await timedOut).status).toBe(200)
    expect((await retried).status).toBe(200)
    const stored = await listing()
    expect(stored.images).toHaveLength(1)
    expect(stored.imageAssets).toHaveLength(1)
    const kept = stored.imageAssets[0].publicId
    const extra = kept === 'rentos/properties/p1' ? 'rentos/properties/p2' : 'rentos/properties/p1'
    expect(deleteFromCloudinary).toHaveBeenCalledTimes(1)
    expect(deleteFromCloudinary).toHaveBeenCalledWith(extra, 'image', 'upload')
  })

  it('different photos, and uploads without a key, are each stored', async () => {
    expect((await send('key-photo-a')).status).toBe(200)
    expect((await send('key-photo-b')).status).toBe(200)
    expect((await send(undefined, 2)).status).toBe(200)
    expect((await listing()).images).toHaveLength(4)
  })

  it('refuses a malformed key, or one key for several photos', async () => {
    expect((await send('bad key!')).status).toBe(400)
    expect((await send('key-for-two', 2)).status).toBe(400)
    expect(uploads).toBe(0)
  })
})

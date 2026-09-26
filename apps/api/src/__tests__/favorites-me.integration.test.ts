import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { config } from '../config/index.js'
import { Property } from '../models/Property.js'
import { Favorite } from '../models/Favorite.js'
import { User } from '../models/User.js'
import propertyRouter from '../routes/properties.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

const uri = testMongoUri

// Web (favoritesStore) and all three mobile screens read `propertyIds`; the
// endpoint only returned { items, total }, so saved listings never showed as
// saved anywhere.
describe.skipIf(!hasTestMongo)('GET /properties/favorites/me', () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const landlordId = new mongoose.Types.ObjectId().toString()
  const ids = [0, 1, 2].map(() => new mongoose.Types.ObjectId())
  let server: Server
  let base = ''

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create({ _id: userId, email: `favs-${userId}@example.test`, phone: 'fixture', firstName: 'Fav', lastName: 'Fixture', passwordHash: 'fixture', roles: ['tenant'], activeRole: 'tenant' })
    await Property.collection.insertMany(ids.map((_id, i) => ({
      _id, landlordId, title: `Favourite fixture ${i}`, description: 'Fixture', type: 'apartment', status: 'available',
      // The last one is hidden from the public, so it must not come back.
      listingStatus: i === 2 ? 'draft' : 'published',
      address: { street: `${i} Fav Road`, city: 'Accra', region: 'Greater Accra' }, rentAmount: 1000, rentDurationMonths: 12, advanceMonths: 1,
      images: [], videos: [], rules: [], amenities: [], bedrooms: 1, bathrooms: 1, furnished: false, parkingSpaces: 0,
    })))
    // Saved in order 0, 1, 2 — newest last.
    await Favorite.collection.insertMany(ids.map((id, i) => ({ userId, propertyId: String(id), createdAt: new Date(Date.now() - (10 - i) * 1000) })))
    const app = express(); app.use(express.json())
    app.use('/api/properties', propertyRouter)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    await Promise.all([Favorite.deleteMany({ userId }), Property.deleteMany({ landlordId }), User.deleteOne({ _id: userId })])
    await mongoose.disconnect()
  })

  it('returns propertyIds and items, most recently saved first, public listings only', async () => {
    const token = jwt.sign({ userId, roles: ['tenant'], activeRole: 'tenant', purpose: 'session', sessionVersion: 0 }, config.jwtSecret, { expiresIn: '10m' })
    const res = await fetch(`${base}/api/properties/favorites/me`, { headers: { Authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
    const { data } = await res.json() as { data: { propertyIds: string[]; items: { id: string }[]; total: number } }
    expect(data.propertyIds).toEqual([String(ids[1]), String(ids[0])])
    expect(data.items.map((p) => p.id)).toEqual(data.propertyIds)
    expect(data.total).toBe(2)
  })
})

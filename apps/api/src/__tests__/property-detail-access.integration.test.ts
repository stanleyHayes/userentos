import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { config } from '../config/index.js'
import { Property } from '../models/Property.js'
import { User } from '../models/User.js'
import propertyRouter from '../routes/properties.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

const uri = testMongoUri

// The review queue links reviewers to /properties/:id, where the moderation
// buttons live; government and legal officers got "Property not found" there
// for every listing awaiting review.
describe.skipIf(!hasTestMongo)('GET /properties/:id for a listing awaiting review', () => {
  const accounts = {
    owner: { id: new mongoose.Types.ObjectId().toString(), roles: ['landlord'] },
    government: { id: new mongoose.Types.ObjectId().toString(), roles: ['government'] },
    legal: { id: new mongoose.Types.ObjectId().toString(), roles: ['legal_officer'] },
    tenant: { id: new mongoose.Types.ObjectId().toString(), roles: ['tenant'] },
  }
  const propertyId = new mongoose.Types.ObjectId()
  let server: Server
  let base = ''

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create(Object.entries(accounts).map(([name, a]) => ({
      _id: a.id, email: `detail-${name}-${a.id}@example.test`, phone: 'fixture', firstName: name, lastName: 'Fixture', passwordHash: 'fixture', roles: a.roles, activeRole: a.roles[0],
    })))
    await Property.collection.insertOne({
      _id: propertyId, landlordId: accounts.owner.id, title: 'Awaiting review', description: 'Fixture', type: 'apartment', status: 'available', listingStatus: 'pending_review',
      address: { street: '1 Review Road', city: 'Accra', region: 'Greater Accra' }, rentAmount: 1000, rentDurationMonths: 12, advanceMonths: 1,
      images: [], videos: [], rules: [], amenities: [], bedrooms: 1, bathrooms: 1, furnished: false, parkingSpaces: 0,
    })
    const app = express(); app.use(express.json())
    app.use('/api/properties', propertyRouter)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    await Promise.all([Property.deleteOne({ _id: propertyId }), User.deleteMany({ _id: { $in: Object.values(accounts).map((a) => a.id) } })])
    await mongoose.disconnect()
  })

  const open = async (who: keyof typeof accounts) => {
    const a = accounts[who]
    const token = jwt.sign({ userId: a.id, roles: a.roles, activeRole: a.roles[0], permissions: [], purpose: 'session', sessionVersion: 0 }, config.jwtSecret, { expiresIn: '10m' })
    return (await fetch(`${base}/api/properties/${propertyId}`, { headers: { Authorization: `Bearer ${token}` } })).status
  }

  it('opens for the owner and for reviewers, and stays hidden from everyone else', async () => {
    expect(await open('owner')).toBe(200)
    expect(await open('government')).toBe(200)
    expect(await open('legal')).toBe(200)
    expect(await open('tenant')).toBe(404)
    expect((await fetch(`${base}/api/properties/${propertyId}`)).status).toBe(404)
  })
})

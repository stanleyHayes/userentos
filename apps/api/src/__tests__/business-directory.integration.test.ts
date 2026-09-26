import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { Business } from '../models/Business.js'
import { BusinessListing } from '../models/BusinessListing.js'
import { Agreement } from '../models/Agreement.js'
import { Property } from '../models/Property.js'
import router from '../routes/businesses.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

const uri = testMongoUri
describe.skipIf(!hasTestMongo)('local services directory', () => {
  const [mover, stranger, owner] = Array.from({ length: 3 }, () => new mongoose.Types.ObjectId())
  const tag = String(owner)
  const city = `Tema-${tag}`
  const [featured, verified, newest, pending] = Array.from({ length: 4 }, () => new mongoose.Types.ObjectId())
  const propertyId = new mongoose.Types.ObjectId()
  let server: Server
  let base = ''

  const directory = async (as: mongoose.Types.ObjectId, qs = '') => {
    const token = jwt.sign({ userId: String(as), roles: ['tenant'], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })
    const res = await fetch(`${base}/api/businesses?city=${encodeURIComponent(city)}${qs}`, { headers: { Authorization: `Bearer ${token}` } })
    return { status: res.status, body: await res.json() }
  }
  type Item = { business: { id: string }; listings: { title: string; newMoverOnly?: boolean }[]; isFeatured?: boolean }

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create([mover, stranger, owner].map((_id, i) => ({
      _id, email: `directory-${i}-${_id}@rentos.test`, phone: '0241234567', firstName: 'Dir', lastName: `Fixture${i}`,
      passwordHash: 'fixture-only', roles: [i === 2 ? 'business' : 'tenant'], activeRole: i === 2 ? 'business' : 'tenant',
    })))
    const now = Date.now()
    const business = (_id: mongoose.Types.ObjectId, name: string, extra: Record<string, unknown>) => ({
      _id, ownerId: String(owner), name, category: 'furniture', phone: '0241234567', city, approvalStatus: 'approved',
      isVerified: false, viewCount: 0, ratingAvg: 0, reviewCount: 0, subscriptionTier: 'free', ...extra,
    })
    await Business.collection.insertMany([
      // Paid for featured placement, but otherwise the oldest and unreviewed.
      business(featured, 'Paid Furniture', { subscriptionTier: 'featured', featuredUntil: new Date(now + 7 * 86_400_000), createdAt: new Date(now - 3000) }),
      business(verified, 'Reviewed Furniture', { isVerified: true, createdAt: new Date(now - 2000) }),
      business(newest, 'Newest Furniture', { createdAt: new Date(now - 1000) }),
      business(pending, 'Pending Furniture', { approvalStatus: 'pending', createdAt: new Date(now) }),
    ])
    await BusinessListing.collection.insertMany([
      { businessId: String(verified), title: 'Sofa', type: 'product', isActive: true, viewCount: 0, images: [], newMoverOnly: false, createdAt: new Date(now - 500) },
      { businessId: String(verified), title: 'Welcome discount', type: 'discount', promoText: '15% off', isActive: true, viewCount: 0, images: [], newMoverOnly: true, createdAt: new Date(now) },
    ])
    // The mover signed a lease in this city last week; the stranger did not.
    await Property.collection.insertOne({ _id: propertyId, landlordId: String(owner), title: 'Directory fixture', address: { city } })
    await Agreement.collection.insertOne({
      propertyId: String(propertyId), landlordId: String(owner), tenantId: String(mover), status: 'active', startDate: '2026-09-20', endDate: '2027-09-20',
      rentAmount: 1000, createdAt: new Date(now - 7 * 86_400_000),
    })
    const app = express(); app.use(express.json()); app.use('/api/businesses', router)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    await BusinessListing.deleteMany({ businessId: { $in: [featured, verified, newest, pending].map(String) } })
    await Business.deleteMany({ _id: { $in: [featured, verified, newest, pending] } })
    await Agreement.deleteMany({ propertyId: String(propertyId) })
    await Property.deleteOne({ _id: propertyId })
    await User.deleteMany({ _id: { $in: [mover, stranger, owner] } })
    await mongoose.disconnect()
  })

  it('lists organically (reviewed, then newest) and flags nothing unless asked for the paid placement', async () => {
    const { status, body } = await directory(stranger)

    expect(status).toBe(200)
    const items = body.data.items as Item[]
    expect(items.map((i) => i.business.id)).toEqual([verified, newest, featured].map(String))
    expect(items.every((i) => !('isFeatured' in i))).toBe(true)
  })

  it('boosts and flags paid businesses only for placement=directory', async () => {
    const { body } = await directory(stranger, '&placement=directory')

    const items = body.data.items as Item[]
    expect(items.map((i) => i.business.id)).toEqual([featured, verified, newest].map(String))
    expect(items.map((i) => i.isFeatured)).toEqual([true, false, false])
  })

  it('refuses an unknown placement', async () => {
    expect((await directory(stranger, '&placement=search_top')).status).toBe(400)
  })

  it('shows new-mover offers to everyone, without reading anyone\'s lease', async () => {
    const agreementLookup = vi.spyOn(Agreement, 'find')
    const propertyLookup = vi.spyOn(Property, 'find')
    try {
      const forMover = await directory(mover)
      const forStranger = await directory(stranger)

      expect(forStranger.body).toEqual(forMover.body)
      const offers = (forStranger.body.data.items as Item[]).find((i) => i.business.id === String(verified))!.listings
      expect(offers.map((l) => [l.title, l.newMoverOnly])).toEqual([['Welcome discount', true], ['Sofa', false]])
      expect(agreementLookup).not.toHaveBeenCalled()
      expect(propertyLookup).not.toHaveBeenCalled()
    } finally {
      agreementLookup.mockRestore()
      propertyLookup.mockRestore()
    }
  })
})

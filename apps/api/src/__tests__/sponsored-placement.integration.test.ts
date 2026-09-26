import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { config } from '../config/index.js'
import { Property } from '../models/Property.js'
import { Sponsorship, SponsorshipProduct } from '../models/Sponsorship.js'
import { User } from '../models/User.js'
import propertyRouter from '../routes/properties.js'
import commerceRouter from '../routes/marketplaceCommerce.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

const uri = testMongoUri
describe.skipIf(!hasTestMongo)('sponsored listings on the public browse', () => {
  const landlordId = String(new mongoose.Types.ObjectId())
  const adminId = new mongoose.Types.ObjectId()
  const accra = `Accra-${landlordId}`
  const kumasi = `Kumasi-${landlordId}`
  let server: Server
  let base = ''
  // Nine Kumasi listings with the oldest campaigns, then four Accra listings
  // with the newest — the shape the old "oldest nine, then filter" query lost.
  const cities = [...Array(9).fill(kumasi), ...Array(4).fill(accra)] as string[]
  const propertyIds = cities.map(() => new mongoose.Types.ObjectId())
  const campaignIds = cities.map(() => new mongoose.Types.ObjectId())
  const accraCampaigns = campaignIds.slice(9).map(String)

  const browse = async (qs: string) => {
    const res = await fetch(`${base}/api/properties?${qs}`)
    return { status: res.status, items: res.ok ? (await res.json()).data.items as { id: string; sponsored?: boolean; sponsorshipId?: string }[] : [] }
  }
  const impressions = async () => Object.fromEntries(
    (await Sponsorship.find({ _id: { $in: campaignIds } }).select('metrics.impressions').lean())
      .map((c) => [String(c._id), c.metrics?.impressions ?? 0]),
  )

  beforeAll(async () => {
    await mongoose.connect(uri)
    await Property.collection.insertMany(cities.map((city, i) => ({
      _id: propertyIds[i], landlordId, title: `Sponsored fixture ${i}`, description: 'Fixture', type: i === 8 ? 'house' : 'apartment', status: 'available', listingStatus: 'published',
      address: { street: `${i} Fixture Road`, city, region: 'Fixture' }, rentAmount: 1000 + i, rentDurationMonths: 12, advanceMonths: 1,
      images: [], videos: [], rules: [], amenities: [], bedrooms: 1, bathrooms: 1, furnished: false, parkingSpaces: 0, createdAt: new Date(Date.now() - i * 1000),
    })))
    const now = Date.now()
    await Sponsorship.collection.insertMany(cities.map((_, i) => ({
      _id: campaignIds[i], propertyId: String(propertyIds[i]), ownerId: landlordId, productId: 'fixture', placement: 'search_top',
      startAt: new Date(now - 86_400_000), endAt: new Date(now + 86_400_000), spend: 0, status: 'active',
      metrics: { impressions: 0, clicks: 0 }, createdAt: new Date(now - (20 - i) * 60_000),
    })))
    await User.create({
      _id: adminId, email: `sponsor-admin-${adminId}@rentos.test`, phone: '0241234567', firstName: 'Sponsor', lastName: 'Admin',
      passwordHash: 'fixture-only', roles: ['admin'], activeRole: 'admin',
    })
    const app = express(); app.use(express.json())
    app.use('/api/properties', propertyRouter)
    app.use('/api/marketplace', commerceRouter)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    await Sponsorship.deleteMany({ _id: { $in: campaignIds } })
    await Property.deleteMany({ landlordId })
    await SponsorshipProduct.deleteMany({ name: `Fixture product ${landlordId}` })
    await User.deleteOne({ _id: adminId })
    await mongoose.disconnect()
  })

  it('shows organic order with no label and counts nothing unless the page asks', async () => {
    const { status, items } = await browse(`city=${encodeURIComponent(accra)}`)

    expect(status).toBe(200)
    expect(items).toHaveLength(4)
    expect(items.filter((p) => p.sponsored)).toEqual([])
    // Give a fire-and-forget $inc time to land if one had been sent.
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(Object.values(await impressions()).every((n) => n === 0)).toBe(true)
  })

  it('serves newer campaigns in a case-insensitively matched city and counts each once', async () => {
    const { items } = await browse(`city=${encodeURIComponent(accra.toLowerCase())}&placement=search_top`)

    const sponsored = items.filter((p) => p.sponsored)
    expect(sponsored).toHaveLength(3)
    expect(items.slice(0, 3).every((p) => p.sponsored)).toBe(true)
    // Least-shown first, then oldest: the three older Accra campaigns.
    expect(sponsored.map((p) => p.sponsorshipId).sort()).toEqual(accraCampaigns.slice(0, 3).sort())
    await expect.poll(async () => { const counts = await impressions(); return accraCampaigns.map((id) => counts[id]) }, { timeout: 3000 })
      .toEqual([1, 1, 1, 0])
    const counts = await impressions()
    expect(campaignIds.slice(0, 9).map((id) => counts[String(id)])).toEqual(Array(9).fill(0))
  })

  it('rotates to the campaign that has been shown least', async () => {
    const { items } = await browse(`city=${encodeURIComponent(accra)}&placement=search_top`)

    expect(items.filter((p) => p.sponsored).map((p) => p.sponsorshipId)).toContain(accraCampaigns[3])
  })

  it('serves an on-page campaign even when the least-shown ones are not on the page', async () => {
    // The only Kumasi house carries the newest Kumasi campaign; the three
    // least-shown (oldest) campaigns are on apartments this filter hides.
    const { items } = await browse(`city=${encodeURIComponent(kumasi)}&type=house&placement=search_top`)

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: String(propertyIds[8]), sponsored: true, sponsorshipId: String(campaignIds[8]) })
    await expect.poll(async () => (await impressions())[String(campaignIds[8])], { timeout: 3000 }).toBe(1)
  })

  it('refuses a placement nothing serves', async () => {
    expect((await browse('placement=homepage')).status).toBe(400)
  })

  it('will not sell a product for a placement nothing serves', async () => {
    const token = jwt.sign({ userId: String(adminId), roles: ['admin'], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })
    const create = (placement: string) => fetch(`${base}/api/marketplace/sponsorship/products`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Fixture product ${landlordId}`, placement, durationDays: 7, price: 50 }),
    })

    for (const placement of ['homepage', 'category', 'city']) expect((await create(placement)).status).toBe(400)
    expect((await create('search_top')).status).toBe(201)
  })
})

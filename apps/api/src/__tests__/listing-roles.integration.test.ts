import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../utils/cloudinary.js', () => ({ uploadToCloudinary: vi.fn(), deleteFromCloudinary: vi.fn() }))

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { Property } = await import('../models/Property.js')
const { Storefront } = await import('../models/Storefront.js')
const { errorHandler } = await import('../middleware/errorHandler.js')
const { default: propertyRouter } = await import('../routes/properties.js')
const { default: moderationRouter } = await import('../routes/propertyModeration.js')
const { default: storefrontRouter } = await import('../routes/storefronts.js')
const { listingContact } = await import('../services/listingContact.js')

/*
 * Any signed-in account (a tenant, a worker, a business) could create and
 * publish listings and launch a public website by calling the API directly.
 * Listing property and running a property website are for landlords & owners
 * and agents / agencies / property managers.
 */
describe.skipIf(!hasTestMongo)('only property professionals list property and launch websites', () => {
  const roles = ['tenant', 'service_provider', 'business', 'developer', 'landlord', 'property_manager'] as const
  const ids = Object.fromEntries(roles.map((role) => [role, new mongoose.Types.ObjectId()])) as Record<(typeof roles)[number], mongoose.Types.ObjectId>
  const tag = String(ids.tenant).slice(-8)
  const someId = String(new mongoose.Types.ObjectId())
  let server: Server
  let base = ''
  const headers = (role: (typeof roles)[number]) => ({
    Authorization: `Bearer ${jwt.sign({ userId: String(ids[role]), roles: [role], activeRole: role, permissions: [], purpose: 'session', sessionVersion: 0 }, config.jwtSecret, { expiresIn: '10m' })}`,
    'Content-Type': 'application/json',
  })
  const send = (method: string, path: string, role: (typeof roles)[number], body?: unknown) =>
    fetch(`${base}${path}`, { method, headers: headers(role), body: body === undefined ? undefined : JSON.stringify(body) })
  const listing = {
    title: `Role gate flat ${tag}`, description: 'A two-bedroom flat for the role gate test.', type: 'apartment' as const, listingType: 'rent' as const,
    address: { street: '1 Gate Road', city: 'Accra', region: 'Greater Accra', neighborhood: 'Osu' },
    rentAmount: 1000, rentDurationMonths: 12, advanceMonths: 1, bedrooms: 2, bathrooms: 1,
  }

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await User.create(roles.map((role) => ({
      _id: ids[role], email: `gate-${role}-${tag}@rentos.test`, phone: '0241234567', firstName: 'Gate', lastName: role,
      passwordHash: 'fixture-only', roles: [role], activeRole: role,
    })))
    const app = express()
    app.use(express.json())
    app.use('/api/storefronts', storefrontRouter)
    app.use('/api/properties', moderationRouter)
    app.use('/api/properties', propertyRouter)
    app.use(errorHandler)
    server = await new Promise<Server>((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    const owners = Object.values(ids).map(String)
    await Property.deleteMany({ landlordId: { $in: owners } })
    await Storefront.deleteMany({ ownerId: { $in: owners } })
    await User.deleteMany({ _id: { $in: Object.values(ids) } })
    await mongoose.disconnect()
  })

  it('refuses tenants, workers, businesses and developers: listing, publishing, review, photos and websites', async () => {
    for (const role of ['tenant', 'service_provider', 'business', 'developer'] as const) {
      expect((await send('POST', '/api/properties', role, listing)).status, `${role} create`).toBe(403)
      expect((await send('POST', `/api/properties/${someId}/publish`, role)).status, `${role} publish`).toBe(403)
      expect((await send('POST', `/api/properties/${someId}/submit`, role)).status, `${role} submit`).toBe(403)
      expect((await send('POST', `/api/properties/${someId}/images`, role)).status, `${role} photos`).toBe(403)
      expect((await send('POST', '/api/storefronts', role, { name: 'Side business' })).status, `${role} website`).toBe(403)
      expect((await send('POST', '/api/storefronts/me/publish', role, { published: true })).status, `${role} website launch`).toBe(403)
    }
    expect(await Property.countDocuments({ title: listing.title })).toBe(0)
  })

  it('still lets any owner take a website down and remove a photo of their own listing', async () => {
    const owner = String(ids.business)
    await Storefront.create({ ownerType: 'user', ownerId: owner, slug: `shop${tag}`, name: 'Side Shop', status: 'active', published: true })
    expect((await send('POST', '/api/storefronts/me/publish', 'business', { published: true })).status).toBe(403)
    const down = await send('POST', '/api/storefronts/me/publish', 'business', { published: false })
    expect(down.status).toBe(200)
    expect((await Storefront.findOne({ ownerId: owner }).lean())?.published).toBe(false)

    const listingDoc = await Property.create({ ...listing, title: `Owned by a tenant ${tag}`, landlordId: String(ids.tenant), images: ['https://img.example/face.jpg'], listingStatus: 'draft' })
    const removed = await send('DELETE', `/api/properties/${listingDoc._id}/images`, 'tenant', { url: 'https://img.example/face.jpg' })
    expect(removed.status).not.toBe(403)
    expect((await Property.findById(listingDoc._id).lean())?.images ?? []).not.toContain('https://img.example/face.jpg')
  })

  it('lets landlords and agents create a listing', async () => {
    for (const role of ['landlord', 'property_manager'] as const) {
      const res = await send('POST', '/api/properties', role, { ...listing, title: `${listing.title} ${role}` })
      expect(res.status, role).toBe(201)
    }
  })

  it('lists an agent’s own drafts and reviews under mine=true, and never another owner’s', async () => {
    // The mobile Properties tab opens on mine=true for agents and landlords.
    const agent = String(ids.property_manager)
    await Property.create([
      { ...listing, title: `Mine draft ${tag}`, landlordId: agent, listingStatus: 'draft' },
      { ...listing, title: `Mine changes ${tag}`, landlordId: agent, listingStatus: 'changes_requested', reviewIssues: ['Add a photo of the kitchen'] },
      { ...listing, title: `Other draft ${tag}`, landlordId: String(ids.landlord), listingStatus: 'draft' },
    ])
    const titles = async (path: string) => ((await (await send('GET', path, 'property_manager')).json()) as { data: { items: { title: string; listingStatus?: string; reviewIssues?: string[] }[] } }).data.items
    const mine = await titles(`/api/properties?mine=true&pageSize=100&search=${tag}`)
    expect(mine.map((p) => p.title)).toEqual(expect.arrayContaining([`Mine draft ${tag}`, `Mine changes ${tag}`]))
    expect(mine.map((p) => p.title)).not.toContain(`Other draft ${tag}`)
    expect(mine.find((p) => p.title === `Mine changes ${tag}`)).toMatchObject({ listingStatus: 'changes_requested', reviewIssues: ['Add a photo of the kitchen'] })
    // Browsing, another owner's draft stays hidden as well.
    expect((await titles(`/api/properties?pageSize=100&search=${tag}`)).map((p) => p.title)).not.toContain(`Other draft ${tag}`)
  })

  it('links a listing to its owner’s website only once the website is launched', async () => {
    const owner = String(ids.property_manager)
    await Storefront.create({ ownerType: 'user', ownerId: owner, slug: `gate${tag}`, name: 'Gate Homes', status: 'active', published: false })
    // A draft website answers 404 to the public.
    expect((await listingContact(owner))?.agent).toMatchObject({ websiteUrl: null, storefrontSlug: null })
    await Storefront.updateOne({ ownerId: owner }, { $set: { published: true } })
    const launched = (await listingContact(owner))?.agent
    expect(launched?.storefrontSlug).toBe(`gate${tag}`)
    expect(launched?.websiteUrl).toContain(`gate${tag}`)
  })
})

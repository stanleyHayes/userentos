import mongoose from 'mongoose'
import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Storefront } from '../models/Storefront.js'
import { StorefrontDomain } from '../models/StorefrontDomain.js'
import { Property } from '../models/Property.js'
import { storefrontHost } from '../middleware/storefrontHost.js'
import router from '../routes/storefronts.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

const uri = testMongoUri
describe.skipIf(!hasTestMongo)('public storefront reads', () => {
  const run = new mongoose.Types.ObjectId().toString()
  const ownerId = String(new mongoose.Types.ObjectId())
  const slug = `pub-${run.slice(-10)}`
  const activeDomain = `homes-${run}.example`
  const pendingDomain = `pending-${run}.example`
  let storefrontId = ''
  let server: Server
  const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/storefronts`
  const resolve = async (host?: string) =>
    (await (await fetch(`${base()}/resolve/host${host === undefined ? '' : `?host=${encodeURIComponent(host)}`}`)).json()).data

  beforeAll(async () => {
    await mongoose.connect(uri)
    const storefront = await Storefront.collection.insertOne({ ownerType: 'user', ownerId, slug, name: 'Homes by Ama', status: 'active', canonicalDomain: activeDomain })
    storefrontId = String(storefront.insertedId)
    await StorefrontDomain.collection.insertMany([
      { storefrontId, domain: activeDomain, verificationToken: 't1', status: 'active' },
      { storefrontId, domain: pendingDomain, verificationToken: 't2', status: 'pending' },
    ])
    // 15 public listings (more than one default page), one draft that must stay off the storefront.
    await Property.collection.insertMany([
      ...Array.from({ length: 15 }, (_, i) => ({
        landlordId: ownerId, title: `Listing ${i}`, description: 'A listing', type: 'apartment', status: 'available',
        listingStatus: i % 2 ? 'published' : 'approved', createdAt: new Date(Date.now() - i * 1000),
        address: { street: '1 Road', city: 'Accra', region: 'Greater Accra' }, rentAmount: 1000 + i, rentDurationMonths: 12, advanceMonths: 1,
        embedding: [0.1, 0.2, 0.3], reviewedBy: 'staff-reviewer', quotaSlot: i, reviewVersion: 2, reviewIssues: ['internal note'], rejectionReason: 'old moderation note',
      })),
      { landlordId: ownerId, title: 'Draft', description: 'x', type: 'room', status: 'available', listingStatus: 'draft', address: { street: '1', city: 'Accra', region: 'GA' }, rentAmount: 1, rentDurationMonths: 12, advanceMonths: 1 },
    ])
    // Mounted the way index.ts mounts it, so the Host-header middleware runs too.
    const app = express(); app.use(express.json()); app.use('/api/storefronts', storefrontHost, router)
    server = await new Promise<Server>(r => { const listener = app.listen(0, '127.0.0.1', () => r(listener)) })
  })
  afterAll(async () => {
    if (server) await new Promise<void>(r => server.close(() => r()))
    await Promise.all([
      Property.deleteMany({ landlordId: ownerId }),
      StorefrontDomain.deleteMany({ storefrontId }),
      Storefront.deleteMany({ ownerId }),
    ])
    await mongoose.disconnect()
  })

  it('resolves a custom domain named by the browser, since the request itself reaches the API host', async () => {
    // The Host here is 127.0.0.1, as api.userentos.com is in production.
    expect(await resolve()).toBeNull()
    expect(await resolve(activeDomain)).toMatchObject({ slug, name: 'Homes by Ama', canonicalUrl: `https://${activeDomain}` })
    expect(await resolve(` ${activeDomain.toUpperCase()} `)).toMatchObject({ slug })
    expect(await resolve(`${slug}.userentos.com`)).toMatchObject({ slug })
  })

  it('resolves nothing for an unverified, unknown or platform host', async () => {
    expect(await resolve(pendingDomain)).toBeNull()
    expect(await resolve(`nobody-${run}.example`)).toBeNull()
    expect(await resolve('userentos.com')).toBeNull()
    expect(await resolve('api.userentos.com')).toBeNull()
    expect(await resolve('x'.repeat(300))).toBeNull()
  })

  it('serves listings without internal fields, with a total and pages to reach all of them', async () => {
    const first = (await (await fetch(`${base()}/${slug}/properties`)).json()).data
    expect(first).toMatchObject({ total: 15, page: 1, limit: 12, totalPages: 2 })
    expect(first.items).toHaveLength(12)
    for (const item of first.items) {
      expect(item.id).toMatch(/^[a-f0-9]{24}$/)
      for (const field of ['embedding', 'reviewedBy', 'quotaSlot', 'reviewVersion', 'reviewIssues', 'rejectionReason']) {
        expect(item, field).not.toHaveProperty(field)
      }
    }

    const second = (await (await fetch(`${base()}/${slug}/properties?page=2`)).json()).data
    expect(second.items).toHaveLength(3)
    const titles = [...first.items, ...second.items].map((p: { title: string }) => p.title)
    expect(new Set(titles).size).toBe(15)
    expect(titles).not.toContain('Draft')
  })
})

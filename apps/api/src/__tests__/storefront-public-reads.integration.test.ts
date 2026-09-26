import mongoose from 'mongoose'
import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Storefront } from '../models/Storefront.js'
import { StorefrontDomain } from '../models/StorefrontDomain.js'
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
    // Mounted the way index.ts mounts it, so the Host-header middleware runs too.
    const app = express(); app.use(express.json()); app.use('/api/storefronts', storefrontHost, router)
    server = await new Promise<Server>(r => { const listener = app.listen(0, '127.0.0.1', () => r(listener)) })
  })
  afterAll(async () => {
    if (server) await new Promise<void>(r => server.close(() => r()))
    await Promise.all([
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
})

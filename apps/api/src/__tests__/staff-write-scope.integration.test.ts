import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../services/notify.js', () => ({ notify: vi.fn().mockResolvedValue(true) }))

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { MaintenanceRequest } = await import('../models/MaintenanceRequest.js')
const { BlogPost } = await import('../models/BlogPost.js')
const { errorHandler } = await import('../middleware/errorHandler.js')
const { default: maintenanceRouter } = await import('../routes/maintenance.js')
const { default: blogRouter } = await import('../routes/blog.js')

// Oversight roles read; they don't operate. Government keeps read access to
// maintenance, and staff blog routes only touch RentOS editorial.
describe.skipIf(!hasTestMongo)('staff write scope', () => {
  const ids = { tenant: '', landlord: '', gov: '', legal: '', admin: '' }
  for (const key of Object.keys(ids) as (keyof typeof ids)[]) ids[key] = String(new mongoose.Types.ObjectId())
  const tag = `sws${ids.tenant.slice(-8)}`
  let requestId = ''
  let server: Server
  let base = ''
  const headers = (userId: string, roles: string[]) => ({ Authorization: `Bearer ${jwt.sign({ userId, roles, permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`, 'Content-Type': 'application/json' })
  const asGov = headers(ids.gov, ['government'])
  const asLegal = headers(ids.legal, ['legal_officer'])
  const asAdmin = headers(ids.admin, ['admin'])
  const call = async (method: string, path: string, h: Record<string, string>, body?: unknown) => {
    const response = await fetch(`${base}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: response.status, body: await response.json() as { data?: Record<string, unknown>; error?: string } }
  }
  const post = (fields: Record<string, unknown>) => BlogPost.create({ title: `${tag} post`, slug: `${tag}-${new mongoose.Types.ObjectId()}`, excerpt: `${tag} excerpt`, content: 'Body', author: 'Fixture', ...fields })

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    const roleOf: Record<keyof typeof ids, string> = { tenant: 'tenant', landlord: 'landlord', gov: 'government', legal: 'legal_officer', admin: 'admin' }
    await User.create((Object.keys(ids) as (keyof typeof ids)[]).map((key, i) => ({ _id: ids[key], email: `sws-${ids[key]}@rentos.test`, phone: `02400004${10 + i}`, firstName: 'Staff', lastName: key, passwordHash: 'fixture', roles: [roleOf[key]], activeRole: roleOf[key] })))
    requestId = String((await MaintenanceRequest.create({ propertyId: String(new mongoose.Types.ObjectId()), tenantId: ids.tenant, landlordId: ids.landlord, title: 'Leaking tap', description: 'Kitchen tap drips.' }))._id)
    const app = express()
    app.use(express.json())
    app.use('/maintenance', maintenanceRouter)
    app.use('/blog', blogRouter)
    app.use(errorHandler)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Promise.all([
      User.deleteMany({ _id: { $in: Object.values(ids) } }),
      MaintenanceRequest.deleteMany({ landlordId: ids.landlord }),
      BlogPost.deleteMany({ excerpt: `${tag} excerpt` }),
    ])
    await mongoose.disconnect()
  })

  it("stops a government account changing, completing or annotating a tenant's maintenance request", async () => {
    expect((await call('GET', `/maintenance/${requestId}`, asGov)).status).toBe(200)
    expect((await call('PATCH', `/maintenance/${requestId}`, asGov, { status: 'completed', cost: 0 })).status).toBe(403)
    expect((await call('POST', `/maintenance/${requestId}/complete`, asGov, { cost: 0 })).status).toBe(403)
    expect((await call('POST', `/maintenance/${requestId}/notes`, asGov, { text: 'Closing this.' })).status).toBe(403)
    const unchanged = await MaintenanceRequest.findById(requestId).lean()
    expect(unchanged).toMatchObject({ status: 'requested', notes: [] })
    expect(unchanged?.cost).toBeUndefined()
  })

  it('still lets an administrator act on the request', async () => {
    const response = await call('PATCH', `/maintenance/${requestId}`, asAdmin, { status: 'acknowledged' })
    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({ status: 'acknowledged' })
  })

  it("won't let staff edit or delete a seller's storefront post", async () => {
    const storefrontPost = await post({ authorId: ids.landlord, storefrontId: `${tag}-storefront`, platform: false, published: true, status: 'published' })
    const offStorefront = await post({ authorId: ids.landlord, platform: false, published: false, status: 'draft' })
    for (const target of [storefrontPost, offStorefront]) {
      expect((await call('DELETE', `/blog/${target._id}`, asGov)).status).toBe(404)
      expect((await call('PATCH', `/blog/${target._id}`, asLegal, { title: 'Rewritten' })).status).toBe(404)
      expect(await BlogPost.findById(target._id).lean()).toMatchObject({ title: `${tag} post` })
    }
  })

  it('refuses to re-publish a post an admin took down', async () => {
    const removed = await post({ platform: true, published: false, status: 'removed', removedReason: 'Misleading' })
    const response = await call('PATCH', `/blog/${removed._id}`, asLegal, { published: true })
    expect(response.status).toBe(403)
    expect(await BlogPost.findById(removed._id).lean()).toMatchObject({ published: false, status: 'removed' })
  })

  it('still lets staff edit and delete RentOS editorial', async () => {
    const editorial = await post({ platform: true, published: false })
    const edited = await call('PATCH', `/blog/${editorial._id}`, asLegal, { title: 'Updated', published: true })
    expect(edited.status).toBe(200)
    expect(edited.body.data).toMatchObject({ title: 'Updated', published: true })
    expect((await call('DELETE', `/blog/${editorial._id}`, asGov)).status).toBe(200)
    expect(await BlogPost.exists({ _id: editorial._id })).toBeNull()
  })
})

import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

const { analyzePropertyPricing } = vi.hoisted(() => ({ analyzePropertyPricing: vi.fn().mockResolvedValue({ suggestedRent: 1000 }) }))
vi.mock('../services/pricing.js', async (orig) => ({ ...(await orig() as Record<string, unknown>), analyzePropertyPricing }))

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { Worker } = await import('../models/Worker.js')
const { ServiceBooking } = await import('../models/ServiceBooking.js')
const { errorHandler } = await import('../middleware/errorHandler.js')
const { queryBoolean, blankToUndefined } = await import('../utils/params.js')
const { default: serviceBookingsRouter } = await import('../routes/serviceBookings.js')
const { default: workersRouter } = await import('../routes/workers.js')
const { default: pricingRouter } = await import('../routes/pricing.js')

describe('query-string flags', () => {
  const schema = z.object({ flag: queryBoolean(), withDefault: queryBoolean().default(false) })

  it("reads only 'true' and '1' as true — z.coerce.boolean() read 'false' as true", () => {
    expect(schema.parse({ flag: 'true', withDefault: '1' })).toEqual({ flag: true, withDefault: true })
    for (const value of ['false', '0', '', 'no', 'yes']) expect(schema.parse({ flag: value, withDefault: value })).toEqual({ flag: false, withDefault: false })
    expect(schema.parse({})).toEqual({ withDefault: false })
    expect(schema.parse({ flag: ['false', 'true'] }).flag).toBe(false)
  })

  it('treats a blank value as absent', () => {
    expect(z.object({ n: z.preprocess(blankToUndefined, z.coerce.number().positive().optional()) }).parse({ n: '' })).toEqual({})
  })
})

describe.skipIf(!hasTestMongo)('boolean and blank query parameters on list routes', () => {
  const customer = String(new mongoose.Types.ObjectId())
  const workerUser = String(new mongoose.Types.ObjectId())
  const tag = `qf${customer.slice(-8)}`
  const workerIds: string[] = []
  let server: Server
  let base = ''
  const token = (userId: string, roles: string[]) => `Bearer ${jwt.sign({ userId, roles, permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`
  const get = async (path: string, userId = customer, roles = ['tenant']) => {
    const response = await fetch(`${base}${path}`, { headers: { Authorization: token(userId, roles) } })
    return { status: response.status, body: await response.json() as { data: { items: { description?: string; name?: string }[] }; error?: string } }
  }

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await User.create([customer, workerUser].map((id, i) => ({ _id: id, email: `qf-${id}@rentos.test`, phone: `02400001${10 + i}`, firstName: 'Query', lastName: `Flag${i}`, passwordHash: 'fixture', roles: [i ? 'service_provider' : 'tenant'], activeRole: i ? 'service_provider' : 'tenant' })))
    const workers = await Worker.create([
      { userId: workerUser, name: `${tag} Emergency`, phone: '0240000001', location: tag, approvalStatus: 'approved', emergencyAvailable: true, verificationLevel: 'verified' },
      { name: `${tag} Regular`, phone: '0240000002', location: tag, approvalStatus: 'approved', emergencyAvailable: false, verificationLevel: 'none' },
    ])
    workerIds.push(...workers.map((w) => String(w._id)))
    // The customer booked the worker; separately, the customer is the worker on another job.
    await ServiceBooking.create([
      { requesterId: customer, requesterRole: 'tenant', workerId: workerIds[0], workerUserId: workerUser, description: `${tag} booked by me` },
      { requesterId: workerUser, requesterRole: 'landlord', workerId: workerIds[1], workerUserId: customer, description: `${tag} I am the worker` },
    ])
    const app = express()
    app.use(express.json())
    app.use('/service-bookings', serviceBookingsRouter)
    app.use('/workers', workersRouter)
    app.use('/pricing', pricingRouter)
    app.use(errorHandler)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  beforeEach(() => analyzePropertyPricing.mockClear())
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Promise.all([
      User.deleteMany({ _id: { $in: [customer, workerUser] } }),
      Worker.deleteMany({ location: tag }),
      ServiceBooking.deleteMany({ description: new RegExp(tag) }),
    ])
    await mongoose.disconnect()
  })

  it("shows the customer's own bookings for asWorker=false, and worker jobs only for asWorker=true", async () => {
    const asCustomer = await get('/service-bookings?asWorker=false')
    expect(asCustomer.status).toBe(200)
    expect(asCustomer.body.data.items.map((b) => b.description)).toEqual([`${tag} booked by me`])
    expect((await get('/service-bookings')).body.data.items.map((b) => b.description)).toEqual([`${tag} booked by me`])
    expect((await get('/service-bookings?asWorker=true')).body.data.items.map((b) => b.description)).toEqual([`${tag} I am the worker`])
  })

  it('does not filter the worker directory when emergency/verified are false', async () => {
    const names = async (qs: string) => (await get(`/workers?location=${tag}${qs}`)).body.data.items.map((w) => w.name).sort()
    expect(await names('&emergency=false&verified=false')).toEqual([`${tag} Emergency`, `${tag} Regular`])
    expect(await names('&emergency=true')).toEqual([`${tag} Emergency`])
    expect(await names('&verified=1')).toEqual([`${tag} Emergency`])
  })

  it('prices an unfurnished property as unfurnished', async () => {
    expect((await get('/pricing/comparables?city=Accra&type=apartment&bedrooms=2&furnished=false')).status).toBe(200)
    expect(analyzePropertyPricing.mock.calls[0][4]).toBe(false)
    await get('/pricing/comparables?city=Accra&type=apartment&bedrooms=2&furnished=true')
    expect(analyzePropertyPricing.mock.calls[1][4]).toBe(true)
  })

  it('accepts the blank floor area the mobile Pricing screen sends on open', async () => {
    const response = await get('/pricing/comparables?city=Accra&type=apartment&bedrooms=2&bathrooms=1&furnished=false&floorArea=')
    expect(response.status).toBe(200)
    expect(analyzePropertyPricing.mock.calls[0][6]).toBeUndefined()
    expect((await get('/pricing/comparables?city=Accra&type=apartment&bedrooms=2&floorArea=0')).status).toBe(400)
  })
})

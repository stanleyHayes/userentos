import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { Property } from '../models/Property.js'
import { Agreement } from '../models/Agreement.js'
import { Review } from '../models/Review.js'
import router from '../routes/reviews.js'

const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('property review eligibility', () => {
  const [landlord, stranger, drafted, halfSigned, current, former] = Array.from({ length: 6 }, () => new mongoose.Types.ObjectId())
  const users = [landlord, stranger, drafted, halfSigned, current, former]
  const propertyId = new mongoose.Types.ObjectId()
  const pid = String(propertyId)
  let server: Server, url: string
  const review = (as: mongoose.Types.ObjectId, rating = 5) => fetch(`${url}/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt.sign({ userId: String(as), roles: ['tenant'], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ propertyId: pid, rating, title: 'My stay', content: 'Lived here for a year, fine.' }),
  })
  const agreement = (tenant: mongoose.Types.ObjectId, status: string, signed: { tenant?: boolean; landlord?: boolean }) => ({
    propertyId: pid, landlordId: String(landlord), tenantId: String(tenant), status, startDate: '2025-01-01', endDate: '2026-01-01',
    rentAmount: 1000, ...(signed.tenant ? { tenantSignature: '2025-01-01T00:00:00Z' } : {}), ...(signed.landlord ? { landlordSignature: '2025-01-01T00:00:00Z' } : {}),
  })

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create(users.map((_id, i) => ({
      _id, email: `review-${i}-${_id}@rentos.test`, phone: '0241234567', firstName: 'Rev', lastName: `Fixture${i}`,
      passwordHash: 'fixture-only', roles: [i ? 'tenant' : 'landlord'], activeRole: i ? 'tenant' : 'landlord',
    })))
    // Raw inserts: these tests are about who may review, not listing validation.
    await Property.collection.insertOne({ _id: propertyId, landlordId: String(landlord), title: 'Review fixture', address: { city: 'Accra' } })
    await Agreement.collection.insertMany([
      agreement(drafted, 'draft', {}),
      agreement(halfSigned, 'pending_signatures', { tenant: true }),
      agreement(current, 'active', { tenant: true, landlord: true }),
      agreement(former, 'terminated', { tenant: true, landlord: true }),
      // A landlord naming themself as tenant on their own property.
      agreement(landlord, 'active', { tenant: true, landlord: true }),
    ])
    // A legacy unverified 1-star review, written before the rule.
    await Review.collection.insertOne({ propertyId: pid, userId: String(stranger), userName: 'Old', rating: 1, title: 'x', content: 'legacy unverified review', verified: false, removed: false })
    const app = express(); app.use(express.json()); app.use('/', router)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    await Review.deleteMany({ propertyId: pid })
    await Agreement.deleteMany({ propertyId: pid })
    await Property.deleteOne({ _id: propertyId })
    await User.deleteMany({ _id: { $in: users } })
    await mongoose.disconnect()
  })

  it.each([
    ['someone with no tenancy', 1],
    ['the landlord of the property', 0],
    ['a tenant on an unsigned draft agreement', 2],
    ['a tenant whose landlord never signed', 3],
  ])('refuses a review from %s', async (_label, index) => {
    const res = await review(users[index])
    expect(res.status).toBe(403)
    expect(await Review.countDocuments({ propertyId: pid, userId: String(users[index]), verified: true })).toBe(0)
  })

  it.each([['a current tenant', 4], ['a former tenant', 5]])('accepts a verified review from %s', async (_label, index) => {
    const res = await review(users[index], 4)
    expect(res.status).toBe(201)
    expect((await res.json()).data.verified).toBe(true)
  })

  it('shows and averages only verified reviews', async () => {
    const { data } = await (await fetch(`${url}/property/${pid}`)).json()
    expect(data.summary).toMatchObject({ count: 2, avgRating: 4 })
    expect(data.reviews.every((r: { verified: boolean }) => r.verified)).toBe(true)
  })
})

import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../utils/cloudinary.js', () => ({
  uploadToCloudinary: vi.fn(async () => ({ url: `https://img.example/${Math.random().toString(36).slice(2)}.jpg`, publicId: 'fixture' })),
  deleteFromCloudinary: vi.fn(),
}))
vi.mock('../services/notify.js', async (orig) => ({
  ...(await orig() as Record<string, unknown>),
  notify: vi.fn().mockResolvedValue(true), notifyPropertyApproved: vi.fn(), notifyPropertyRejected: vi.fn(), notifyPropertyChangesRequested: vi.fn(),
}))

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { Property } = await import('../models/Property.js')
const { PropertyReview } = await import('../models/PropertyReview.js')
const { errorHandler } = await import('../middleware/errorHandler.js')
const { default: propertyRouter } = await import('../routes/properties.js')
const { default: moderationRouter } = await import('../routes/propertyModeration.js')

/*
 * A review decision applied to whatever the listing held when it landed: an
 * owner could edit a listing (or add a photo) while it sat in review and the
 * reviewer's approval, made on the earlier content, published the changes.
 * Photos added to a live listing never went back to review at all.
 */
describe.skipIf(!hasTestMongo)('listing review decisions are pinned to the version reviewed', () => {
  const ownerId = new mongoose.Types.ObjectId()
  const reviewerId = new mongoose.Types.ObjectId()
  const tag = String(ownerId).slice(-8)
  let server: Server
  let base = ''
  const headers = (userId: mongoose.Types.ObjectId, role: string) => ({
    Authorization: `Bearer ${jwt.sign({ userId: String(userId), roles: [role], activeRole: role, permissions: [], purpose: 'session', sessionVersion: 0 }, config.jwtSecret, { expiresIn: '10m' })}`,
  })
  const json = (userId: mongoose.Types.ObjectId, role: string) => ({ ...headers(userId, role), 'Content-Type': 'application/json' })
  const review = (id: string, body: Record<string, unknown>) =>
    fetch(`${base}/api/properties/${id}/review`, { method: 'POST', headers: json(reviewerId, 'admin'), body: JSON.stringify(body) })
  const edit = (id: string, body: Record<string, unknown>) =>
    fetch(`${base}/api/properties/${id}`, { method: 'PATCH', headers: json(ownerId, 'landlord'), body: JSON.stringify(body) })
  const addPhoto = (id: string) => {
    const form = new FormData()
    form.append('images', new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), 'kitchen.jpg')
    return fetch(`${base}/api/properties/${id}/images`, { method: 'POST', headers: headers(ownerId, 'landlord'), body: form })
  }
  const listing = (listingStatus: 'draft' | 'pending_review' | 'in_review' | 'approved', title: string) => Property.create({
    landlordId: String(ownerId), title: `${title} ${tag}`, description: 'Two bedrooms with a balcony.', type: 'apartment', listingStatus, reviewVersion: 1,
    address: { street: '5 Pin Road', city: 'Accra', region: 'Greater Accra' }, rentAmount: 2000, rentDurationMonths: 12, advanceMonths: 1,
  })

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await User.create([
      { _id: ownerId, email: `pin-owner-${tag}@rentos.test`, phone: '0240009101', firstName: 'Pin', lastName: 'Owner', passwordHash: 'fixture', roles: ['landlord'], activeRole: 'landlord' },
      { _id: reviewerId, email: `pin-reviewer-${tag}@rentos.test`, phone: '0240009102', firstName: 'Pin', lastName: 'Reviewer', passwordHash: 'fixture', roles: ['admin'], activeRole: 'admin' },
    ])
    const app = express()
    app.use(express.json())
    app.use('/api/properties', moderationRouter)
    app.use('/api/properties', propertyRouter)
    app.use(errorHandler)
    server = await new Promise<Server>((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    const ids = (await Property.find({ landlordId: String(ownerId) }).select('_id').lean()).map((p) => String(p._id))
    await Promise.all([Property.deleteMany({ landlordId: String(ownerId) }), PropertyReview.deleteMany({ propertyId: { $in: ids } }), User.deleteMany({ _id: { $in: [ownerId, reviewerId] } })])
    await mongoose.disconnect()
  })

  it('refuses an approval made on content the owner has since changed, and accepts one on the latest', async () => {
    const property = await listing('pending_review', 'Edited in review')
    expect((await edit(property.id, { title: `Edited in review ${tag} (new title)` })).status).toBe(200)
    expect(await Property.findById(property.id).lean()).toMatchObject({ listingStatus: 'pending_review', reviewVersion: 2 })

    const stale = await review(property.id, { action: 'approve', reviewVersion: 1 })
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ code: 'REVIEW_VERSION_CHANGED', data: { reviewVersion: 2 } })
    expect((await Property.findById(property.id).lean())?.listingStatus).toBe('pending_review')

    expect((await review(property.id, { action: 'approve', reviewVersion: 2 })).status).toBe(200)
    expect((await Property.findById(property.id).lean())?.listingStatus).toBe('approved')
  })

  it('sends a live listing back to review when a photo is added, and moves a review in progress on', async () => {
    const live = await listing('approved', 'Live with new photo')
    expect((await addPhoto(live.id)).status).toBe(200)
    expect(await Property.findById(live.id).lean()).toMatchObject({ listingStatus: 'pending_review', reviewVersion: 2 })

    const inReview = await listing('in_review', 'Photo during review')
    expect((await addPhoto(inReview.id)).status).toBe(200)
    expect(await Property.findById(inReview.id).lean()).toMatchObject({ listingStatus: 'in_review', reviewVersion: 2 })
    expect((await review(inReview.id, { action: 'approve', reviewVersion: 1 })).status).toBe(409)
  })

  it('leaves a draft and its version alone', async () => {
    const draft = await listing('draft', 'Draft edit')
    expect((await edit(draft.id, { title: `Draft edit ${tag} (renamed)` })).status).toBe(200)
    expect((await addPhoto(draft.id)).status).toBe(200)
    expect(await Property.findById(draft.id).lean()).toMatchObject({ listingStatus: 'draft', reviewVersion: 1 })
  })
})

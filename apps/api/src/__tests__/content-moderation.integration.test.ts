import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
vi.mock('../services/notify.js', () => ({ notify: vi.fn().mockResolvedValue(undefined), notifyNewMessage: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../services/bookingEvents.js', () => ({ emitBookingCreated: vi.fn(), emitBookingUpdated: vi.fn() }))
vi.mock('../utils/audit.js', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }))
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { Conversation, Message } from '../models/Conversation.js'
import { Business } from '../models/Business.js'
import { BusinessInquiry } from '../models/BusinessInquiry.js'
import { BusinessReview } from '../models/BusinessReview.js'
import { Worker } from '../models/Worker.js'
import { ServiceBooking } from '../models/ServiceBooking.js'
import { Property } from '../models/Property.js'
import { Review } from '../models/Review.js'
import { ContentReport, SYSTEM_REPORTER_ID, type ReportTargetType } from '../models/ContentReport.js'
import { removeReportedContent } from '../services/contentReports.js'
import chat from '../routes/chat.js'
import businesses from '../routes/businesses.js'
import bookings from '../routes/serviceBookings.js'
import reports from '../routes/contentReports.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

const uri = testMongoUri
describe.skipIf(!hasTestMongo)('content moderation on user-generated text', () => {
  const [customer, owner, reporter] = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()]
  const users = [customer, owner, reporter]
  const conversationId = new mongoose.Types.ObjectId(), businessId = new mongoose.Types.ObjectId()
  const workerId = new mongoose.Types.ObjectId(), bookingId = new mongoose.Types.ObjectId()
  const propertyId = new mongoose.Types.ObjectId(), propertyReviewId = new mongoose.Types.ObjectId()
  let server: Server, url: string
  const headers = (id: mongoose.Types.ObjectId) => ({
    Authorization: `Bearer ${jwt.sign({ userId: String(id), roles: ['tenant'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`,
    'Content-Type': 'application/json',
  })
  const send = (method: string, path: string, body: unknown, as = customer) =>
    fetch(`${url}${path}`, { method, headers: headers(as), body: JSON.stringify(body) })
  const automatedReports = (targetType: ReportTargetType, targetId: string) =>
    ContentReport.countDocuments({ reporterId: SYSTEM_REPORTER_ID, targetType, targetId })

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create(users.map((_id, i) => ({
      _id, email: `mod-${i}-${_id}@rentos.test`, phone: '0241234567', firstName: 'Mod', lastName: `Fixture${i}`,
      passwordHash: 'fixture-only', roles: ['tenant'], activeRole: 'tenant',
    })))
    await Conversation.collection.insertOne({ _id: conversationId, participants: [String(customer), String(owner)], unreadCount: {} })
    await Business.collection.insertOne({ _id: businessId, ownerId: String(owner), name: 'Mod Movers', category: 'moving', phone: '0241234567', city: 'Accra', approvalStatus: 'approved', ratingAvg: 0, reviewCount: 0 })
    await BusinessInquiry.collection.insertOne({ businessId: String(businessId), requesterId: String(customer), requesterName: 'Mod', requesterPhone: '0241234567', status: 'won' })
    await Worker.collection.insertOne({ _id: workerId, userId: String(owner), name: 'Mod Plumber', phone: '0241234567', location: 'Accra', approvalStatus: 'approved', rating: 0, reviewCount: 0 })
    await ServiceBooking.collection.insertOne({ _id: bookingId, requesterId: String(customer), requesterRole: 'tenant', workerId: String(workerId), workerUserId: String(owner), description: 'Fix the tap', status: 'completed', notes: [] })
    await Property.collection.insertOne({ _id: propertyId, landlordId: String(owner), title: 'Mod property' })
    await Review.collection.insertOne({ _id: propertyReviewId, propertyId: String(propertyId), userId: String(customer), userName: 'Mod', rating: 4, title: 'Fine', content: 'Fine place overall.', verified: true })
    const app = express(); app.use(express.json())
    app.use('/chat', chat); app.use('/businesses', businesses); app.use('/bookings', bookings); app.use('/reports', reports)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    const ids = [conversationId, businessId, workerId, bookingId, propertyId, propertyReviewId].map(String)
    await ContentReport.deleteMany({ $or: [{ targetId: { $in: ids } }, { reporterId: String(reporter) }, { targetOwnerId: { $in: users.map(String) } }] })
    await Message.deleteMany({ conversationId: String(conversationId) })
    await Conversation.deleteOne({ _id: conversationId })
    await BusinessReview.deleteMany({ businessId: String(businessId) })
    await BusinessInquiry.deleteMany({ businessId: String(businessId) })
    await Business.deleteOne({ _id: businessId })
    await ServiceBooking.deleteOne({ _id: bookingId })
    await Worker.deleteOne({ _id: workerId })
    await Review.deleteMany({ propertyId: String(propertyId) })
    await Property.deleteOne({ _id: propertyId })
    await User.deleteMany({ _id: { $in: users } })
    await mongoose.disconnect()
  })

  it('refuses an abusive chat message without delivering it', async () => {
    const res = await send('POST', `/chat/conversations/${conversationId}/messages`, { text: 'I will kill you if you call again' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).not.toMatch(/kill/)
    expect(await Message.countDocuments({ conversationId: String(conversationId) })).toBe(0)
  })

  it('delivers a borderline chat message and queues it for a moderator', async () => {
    const res = await send('POST', `/chat/conversations/${conversationId}/messages`, { text: 'Sleep with me and I will reduce the rent' })
    expect(res.status).toBe(201)
    const { data } = await res.json()
    await vi.waitFor(async () => expect(await automatedReports('message', data.id)).toBe(1))
    // Mere swearing between two people is theirs to have.
    const casual = await (await send('POST', `/chat/conversations/${conversationId}/messages`, { text: 'this traffic is shit' })).json()
    expect(await automatedReports('message', casual.data.id)).toBe(0)
  })

  it('refuses an abusive business review and queues a borderline one', async () => {
    expect((await send('POST', `/businesses/${businessId}/reviews`, { rating: 1, review: 'you stupid bitch' })).status).toBe(400)
    expect(await BusinessReview.countDocuments({ businessId: String(businessId) })).toBe(0)

    const res = await send('POST', `/businesses/${businessId}/reviews`, { rating: 2, review: 'The movers were shit and late' })
    expect(res.status).toBe(200)
    const { data } = await res.json()
    await vi.waitFor(async () => expect(await automatedReports('business_review', data.id)).toBe(1))
  })

  it('refuses an abusive worker review and queues a borderline one', async () => {
    expect((await send('PATCH', `/bookings/${bookingId}`, { rating: 1, review: 'Fuck you, never again' })).status).toBe(400)
    expect((await ServiceBooking.findById(bookingId).lean())?.review).toBeUndefined()

    expect((await send('PATCH', `/bookings/${bookingId}`, { rating: 2, review: 'Absolute bullshit work' })).status).toBe(200)
    await vi.waitFor(async () => expect(await automatedReports('worker_review', String(bookingId))).toBe(1))
  })

  it.each([
    ['property', () => String(propertyId)],
    ['review', () => String(propertyReviewId)],
    ['business', () => String(businessId)],
    ['worker', () => String(workerId)],
    ['user', () => String(owner)],
    ['business_review', async () => String((await BusinessReview.findOne({ businessId: String(businessId) }).lean())!._id)],
    ['worker_review', () => String(bookingId)],
  ])('accepts a user report of a %s', async (targetType, target) => {
    const res = await send('POST', '/reports', { targetType, targetId: await target(), reason: 'offensive_content' }, reporter)
    expect(res.status).toBe(201)
  })

  it('hides a removed business or worker review and drops it from the rating', async () => {
    const review = await BusinessReview.findOne({ businessId: String(businessId) }).lean()
    expect(await removeReportedContent('business_review', String(review!._id), 'Abusive')).toBe(true)
    expect((await Business.findById(businessId).lean())?.reviewCount).toBe(0)
    const list = await (await fetch(`${url}/businesses/${businessId}/reviews`, { headers: headers(customer) })).json()
    expect(list.data.items).toHaveLength(0)
    // Re-posting cannot overwrite the moderator's decision.
    expect((await send('POST', `/businesses/${businessId}/reviews`, { rating: 5, review: 'Great' })).status).toBe(403)

    expect(await removeReportedContent('worker_review', String(bookingId), 'Abusive')).toBe(true)
    expect((await Worker.findById(workerId).lean())?.reviewCount).toBe(0)
    expect((await send('PATCH', `/bookings/${bookingId}`, { rating: 5, review: 'Actually fine' })).status).toBe(403)
  })
})

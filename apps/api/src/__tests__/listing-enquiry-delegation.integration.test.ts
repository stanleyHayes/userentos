import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../services/notify.js', async (orig) => ({ ...(await orig() as Record<string, unknown>), notify: vi.fn().mockResolvedValue(true), notifyNewMessage: vi.fn().mockResolvedValue(true) }))

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { Property } = await import('../models/Property.js')
const { Lead } = await import('../models/Lead.js')
const { Delegation } = await import('../models/Delegation.js')
const { Conversation, Message } = await import('../models/Conversation.js')
const { default: agentRouter } = await import('../routes/agent.js')

/*
 * "Message on RentOS" on a listing now goes through the enquiry endpoint
 * (web ContactLandlordModal, mobile property screen). It used to open a plain
 * chat with the owner: no lead, no SMS, and an agent the owner had delegated
 * enquiries to never heard about it. On mobile the typed text was dropped.
 */
describe.skipIf(!hasTestMongo)('a listing enquiry reaches whoever handles the listing, with its text', () => {
  const ownerId = String(new mongoose.Types.ObjectId())
  const agentId = String(new mongoose.Types.ObjectId())
  const tenantId = String(new mongoose.Types.ObjectId())
  let propertyId = ''
  let server: Server
  let base = ''

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await User.create([
      { _id: ownerId, role: 'landlord' }, { _id: agentId, role: 'property_manager' }, { _id: tenantId, role: 'tenant' },
    ].map(({ _id, role }, i) => ({ _id, email: `enquiry-${_id}@rentos.test`, phone: `02400001${10 + i}`, firstName: 'Enquiry', lastName: role, passwordHash: 'fixture', roles: [role], activeRole: role })))
    const property = await Property.create({
      landlordId: ownerId, title: 'Delegated flat', description: 'Fixture', type: 'apartment', listingStatus: 'published',
      address: { street: '2 Lead St', city: 'Accra', region: 'Greater Accra' }, rentAmount: 1800, rentDurationMonths: 12, advanceMonths: 1,
    })
    propertyId = property.id
    await Delegation.create({ propertyId, ownerId, delegateId: agentId, scopes: ['leads'], status: 'active' })
    const app = express()
    app.use(express.json())
    app.use('/agent', agentRouter)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    const conversations = await Conversation.find({ propertyId }).select('_id').lean()
    await Promise.all([
      User.deleteMany({ _id: { $in: [ownerId, agentId, tenantId] } }),
      Property.deleteOne({ _id: propertyId }), Lead.deleteMany({ propertyId }), Delegation.deleteMany({ propertyId }),
      Message.deleteMany({ conversationId: { $in: conversations.map((c) => String(c._id)) } }), Conversation.deleteMany({ propertyId }),
    ])
    await mongoose.disconnect()
  })

  it('creates one lead for the delegated agent and a conversation holding the typed message', async () => {
    const text = 'Is the flat still available from November? I can view on Saturday.'
    const res = await fetch(`${base}/agent/leads/property/${propertyId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt.sign({ userId: tenantId, roles: ['tenant'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    })
    expect(res.status).toBe(201)
    const { data } = await res.json()
    const leads = await Lead.find({ propertyId }).lean()
    expect(leads).toHaveLength(1)
    expect(leads[0]).toMatchObject({ agentId, requesterId: tenantId })
    expect(data.conversationId).toBeTruthy()
    const conversation = await Conversation.findById(data.conversationId).lean()
    expect(conversation?.participants).toEqual(expect.arrayContaining([tenantId, agentId]))
    expect(conversation?.participants).not.toContain(ownerId)
    expect(await Message.findOne({ conversationId: data.conversationId, senderId: tenantId, text }).lean()).toBeTruthy()
  })
})

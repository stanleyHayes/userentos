import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { DocumentModel } from '../models/Document.js'
import { ProfileAccess } from '../models/ProfileAccess.js'
import { PayoutAccount } from '../models/PayoutAccount.js'
import { Worker } from '../models/Worker.js'
import { Lead } from '../models/Lead.js'
import { WebhookSubscription } from '../models/WebhookSubscription.js'
import { RefreshToken } from '../models/RefreshToken.js'
import { Conversation, Message } from '../models/Conversation.js'
import { Property } from '../models/Property.js'
import router from '../routes/users.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

describe.skipIf(!hasTestMongo)('the data export covers every personal-data collection, from the subject side only', () => {
  const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()]
  const [owner, outsider] = ids.map(String)
  const conversationId = new mongoose.Types.ObjectId()
  let server: Server

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await User.collection.insertMany(ids.map((_id) => ({ _id, email: `coverage-${_id}@rentos.test`, roles: ['tenant'], passwordHash: 'private-password' })))
    await Promise.all([
      DocumentModel.collection.insertMany([owner, outsider].map((ownerId) => ({ ownerId, name: `id-${ownerId}.pdf`, type: 'identity', mimeType: 'application/pdf', fileUrl: `https://example.test/${ownerId}.pdf`, fileSize: 1, accessControl: [ownerId] }))),
      ProfileAccess.collection.insertMany([
        { requesterId: outsider, tenantId: owner, status: 'approved', requestedAt: new Date() },
        { requesterId: 'someone-else', tenantId: outsider, status: 'approved', requestedAt: new Date() },
      ]),
      PayoutAccount.collection.insertMany([owner, outsider].map((userId) => ({ userId, type: 'mobile_money', accountNumber: `0244${userId.slice(-6)}`, bankCode: 'MTN', bankName: 'MTN', accountName: 'Owner', recipientCode: `RCP_${userId}` }))),
      Worker.collection.insertMany([owner, outsider].map((userId) => ({ userId, name: `worker-${userId}`, phone: '0244000000', location: 'Accra' }))),
      // The owner's own enquiry, and an enquiry the owner received as an agent (third-party contact data).
      Lead.collection.insertMany([
        { propertyId: 'p1', agentId: outsider, requesterId: owner, contactName: 'Owner Self', contactPhone: '0244111111' },
        { propertyId: 'p2', agentId: owner, requesterId: outsider, contactName: 'Third Party', contactPhone: '0244999999' },
      ]),
      WebhookSubscription.collection.insertOne({ userId: owner, url: 'https://hooks.example.test', events: ['payment.completed'], secret: 'whsec-private-secret', isActive: true }),
      RefreshToken.collection.insertOne({ userId: owner, tokenHash: 'private-token-hash', ipAddress: '203.0.113.9', deviceLabel: 'Pixel', expiresAt: new Date(Date.now() + 60_000) }),
      Conversation.collection.insertOne({ _id: conversationId, participants: [owner, outsider], unreadCount: {}, lastMessage: { text: 'reply from outsider', senderId: outsider } }),
      Message.collection.insertMany([
        { conversationId: String(conversationId), senderId: owner, text: 'hello from owner' },
        { conversationId: String(conversationId), senderId: outsider, text: 'reply from outsider' },
      ]),
      Property.collection.insertOne({ landlordId: owner, title: 'Owner flat', embedding: [0.42, 0.24], images: [], imageAssets: [] }),
    ])
    const app = express(); app.use('/api/users', router)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  })

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Promise.all([
      User.collection.deleteMany({ _id: { $in: ids } }),
      DocumentModel.collection.deleteMany({ ownerId: { $in: [owner, outsider] } }),
      ProfileAccess.collection.deleteMany({ tenantId: { $in: [owner, outsider] } }),
      PayoutAccount.collection.deleteMany({ userId: { $in: [owner, outsider] } }),
      Worker.collection.deleteMany({ userId: { $in: [owner, outsider] } }),
      Lead.collection.deleteMany({ agentId: { $in: [owner, outsider] } }),
      WebhookSubscription.collection.deleteMany({ userId: owner }),
      RefreshToken.collection.deleteMany({ userId: owner }),
      Conversation.collection.deleteMany({ _id: conversationId }),
      Message.collection.deleteMany({ conversationId: String(conversationId) }),
      Property.collection.deleteMany({ landlordId: owner }),
    ])
    await mongoose.disconnect()
  })

  it('exports documents, access history, payout destination, role profiles and enquiries — and no one else’s', async () => {
    const token = jwt.sign({ userId: owner, roles: ['tenant'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '5m' })
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/users/me/export`, { headers: { Authorization: `Bearer ${token}` } })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const { data } = await response.json()

    expect(data.documents).toHaveLength(1)
    expect(data.documents[0]).toMatchObject({ ownerId: owner, type: 'identity' })
    expect(data.profileAccess).toHaveLength(1)
    expect(data.profileAccess[0]).toMatchObject({ tenantId: owner, requesterId: outsider, status: 'approved' })
    expect(data.payoutAccount).toMatchObject({ userId: owner, accountNumber: `0244${owner.slice(-6)}` })
    expect(data.worker).toMatchObject({ userId: owner, name: `worker-${owner}` })
    expect(data.leads).toHaveLength(1)
    expect(data.leads[0]).toMatchObject({ contactName: 'Owner Self' })
    expect(data.webhookSubscriptions).toHaveLength(1)
    expect(data.webhookSubscriptions[0]).not.toHaveProperty('secret')
    expect(data.sessions[0]).toMatchObject({ ipAddress: '203.0.113.9', deviceLabel: 'Pixel' })
    expect(data.properties[0]).toMatchObject({ title: 'Owner flat' })
    expect(data.properties[0]).not.toHaveProperty('embedding')

    // Sent messages say which conversation they are in and who they went to.
    expect(data.messages).toEqual([expect.objectContaining({ text: 'hello from owner', conversationId: String(conversationId), counterpartIds: [outsider] })])
    expect(data.conversations).toEqual([expect.objectContaining({ id: String(conversationId), counterpartIds: [outsider] })])

    const text = JSON.stringify(data)
    expect(text).not.toMatch(/whsec-private-secret|private-token-hash|private-password|Third Party|0244999999|reply from outsider/)
    expect(text).not.toContain(`id-${outsider}`)
    expect(text).not.toContain(`worker-${outsider}`)
    expect(text).not.toContain(`RCP_${outsider}`)
  })
})

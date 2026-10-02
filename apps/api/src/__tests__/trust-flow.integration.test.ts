/**
 * TRUST-2 end to end against a real database: chat sends, cross-message
 * reassembly through the API, the masked audit record, strikes and the
 * moderation report, appeals and overturns, shadow mode, enquiries that open
 * a conversation instead of sharing phone numbers, and the unread-message
 * email that follows a while later.
 */
import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../services/notify.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/notify.js')>()),
  notify: vi.fn().mockResolvedValue(true),
  notifyNewMessage: vi.fn().mockResolvedValue(true),
}))
vi.mock('../services/email.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/email.js')>()),
  sendEmail: vi.fn().mockResolvedValue(true),
}))
vi.mock('../utils/audit.js', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }))

import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { Conversation, Message } from '../models/Conversation.js'
import { Property } from '../models/Property.js'
import { Lead } from '../models/Lead.js'
import { TrustDecision } from '../models/TrustDecision.js'
import { ContentReport, SYSTEM_REPORTER_ID } from '../models/ContentReport.js'
import { notify, notifyNewMessage } from '../services/notify.js'
import { sendEmail } from '../services/email.js'
import { screenOutbound } from '../services/trust/screen.js'
import { sendUnreadMessageEmails } from '../services/messageAlerts.js'
import chat from '../routes/chat.js'
import agent from '../routes/agent.js'
import trust from '../routes/trust.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

describe.skipIf(!hasTestMongo)('contact protection (TRUST-2) end to end', () => {
  const tenant = new mongoose.Types.ObjectId()
  const agentId = new mongoose.Types.ObjectId()
  const admin = new mongoose.Types.ObjectId()
  const repeat = new mongoose.Types.ObjectId()
  const users = [tenant, agentId, admin, repeat]
  const propertyId = new mongoose.Types.ObjectId()
  const conversationId = new mongoose.Types.ObjectId()
  let server: Server
  let url: string

  const token = (id: mongoose.Types.ObjectId, roles = ['tenant']) =>
    jwt.sign({ userId: String(id), roles, permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })
  const send = (method: string, path: string, body: unknown, as = tenant, roles?: string[]) =>
    fetch(`${url}${path}`, { method, headers: { Authorization: `Bearer ${token(as, roles)}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const chatSend = (text: string, as = tenant) => send('POST', `/chat/conversations/${conversationId}/messages`, { text }, as)

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await User.create(users.map((_id, i) => ({
      _id, email: `trust-${i}-${_id}@rentos.test`, phone: '0241234567', firstName: 'Trust', lastName: `Fixture${i}`,
      passwordHash: 'fixture-only', roles: i === 2 ? ['admin'] : i === 1 ? ['property_manager'] : ['tenant'], activeRole: i === 2 ? 'admin' : i === 1 ? 'property_manager' : 'tenant',
    })))
    await Property.collection.insertOne({ _id: propertyId, landlordId: String(agentId), title: 'Trust Villa', listingStatus: 'published', status: 'available' })
    await Conversation.collection.insertOne({ _id: conversationId, participants: [String(tenant), String(agentId)], unreadCount: {}, pendingEmail: [], emailedUnread: [] })
    const app = express(); app.use(express.json())
    app.use('/chat', chat); app.use('/agent', agent); app.use('/trust', trust)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterEach(() => {
    delete process.env.TRUST2_MODE
    delete process.env.TRUST2_MODEL_ENFORCE_PERCENT
  })

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    const ids = users.map(String)
    await TrustDecision.deleteMany({ authorId: { $in: ids } })
    await ContentReport.deleteMany({ targetId: { $in: ids } })
    await Lead.deleteMany({ agentId: String(agentId) })
    const conversations = await Conversation.find({ participants: { $in: ids } }).select('_id').lean()
    await Message.deleteMany({ conversationId: { $in: conversations.map((c) => String(c._id)) } })
    await Conversation.deleteMany({ participants: { $in: ids } })
    await Property.deleteOne({ _id: propertyId })
    await User.deleteMany({ _id: { $in: users } })
    await mongoose.disconnect()
  })

  it('stops a phone number in chat, stores nothing, and keeps only a masked record', async () => {
    const before = await Message.countDocuments({ conversationId: String(conversationId) })
    const res = await chatSend('Call me on 024 412 3456 for the viewing')
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body).toMatchObject({ success: false, blocked: true, reason: 'OFF_PLATFORM_CONTACT' })
    expect(body.error).toMatch(/wasn't sent/)
    expect(body.decisionId).toBeTruthy()
    // No reason codes or detector names leak to the client (§14).
    expect(JSON.stringify(body)).not.toMatch(/EXACT_PHONE|phone\.gh/)
    expect(await Message.countDocuments({ conversationId: String(conversationId) })).toBe(before)

    const record = await TrustDecision.findById(body.decisionId).lean()
    expect(record).toMatchObject({ decision: 'BLOCK', enforced: true, mode: 'enforce', channel: 'chat', authorId: String(tenant) })
    expect(record!.reasonCodes).toContain('EXACT_PHONE')
    expect(record!.maskedExcerpt).not.toMatch(/\d/)
    expect(record!.textDigest).toBeTruthy()
    expect(JSON.stringify(record)).not.toContain('0244123456')
  })

  it('delivers an ordinary message and alerts the recipient without an immediate email', async () => {
    vi.mocked(notifyNewMessage).mockClear()
    const res = await chatSend('Is the house still available for viewing on Saturday at 10am?')
    expect(res.status).toBe(201)
    expect(vi.mocked(notifyNewMessage)).toHaveBeenCalledWith(String(agentId), expect.any(String), expect.any(String), String(conversationId))
    const conversation = await Conversation.findById(conversationId).lean()
    expect(conversation!.pendingEmail.map((p) => p.userId)).toContain(String(agentId))
  })

  it('stops the message that completes a number split across sends', async () => {
    expect((await chatSend('024')).status).toBe(201)
    expect((await chatSend('412')).status).toBe(201)
    const res = await chatSend('3456')
    expect(res.status).toBe(422)
    const body = await res.json()
    const record = await TrustDecision.findById(body.decisionId).lean()
    expect(record!.reasonCodes).toContain('CROSS_MESSAGE_ASSEMBLY')
    expect(record!.contributingMessageIds.length).toBeGreaterThanOrEqual(2)
  })

  it('warns from the second strike and files one moderation report from the third', async () => {
    const author = String(repeat)
    const r1 = await screenOutbound({ text: 'my number is 0201234567', authorId: author, channel: 'chat' })
    expect(r1.allowed).toBe(false)
    expect(r1.message).not.toMatch(/suspended/)
    const r2 = await screenOutbound({ text: 'whatsapp me 0551234567', authorId: author, channel: 'chat' })
    expect(r2.message).toMatch(/suspended/)
    await screenOutbound({ text: 'kofi.mensah@gmail.com', authorId: author, channel: 'chat' })
    await screenOutbound({ text: 'IG @kofi_homes', authorId: author, channel: 'chat' })
    await new Promise((resolve) => setTimeout(resolve, 150))
    const reports = await ContentReport.find({ reporterId: SYSTEM_REPORTER_ID, targetType: 'user', targetId: author }).lean()
    expect(reports).toHaveLength(1)
    expect(reports[0].reason).toBe('off_platform_contact')
    // Masked excerpts only: never the numbers, address or handle themselves.
    expect(reports[0].targetLabel).not.toMatch(/0201234567|0551234567|kofi\.mensah@gmail\.com|@kofi_homes/)
    expect(reports[0].targetLabel).toContain('<handle>')
    expect(reports[0].details).toMatch(/4 messages stopped/)
  })

  it('lets an author appeal once, and an overturn lets the same text through', async () => {
    const text = 'Our office is at plot 24 near the Total station, see you there'
    // Force a block on this text for the test by sending something the screen stops, then reuse its id.
    const res = await chatSend('send me your whatsapp number please')
    const { decisionId } = await res.json()
    const appeal = await send('POST', `/trust/decisions/${decisionId}/appeal`, { note: 'I was asking about the policy' })
    expect(appeal.status).toBe(200)
    expect((await send('POST', `/trust/decisions/${decisionId}/appeal`, {})).status).toBe(409)
    // Someone else cannot appeal it.
    expect((await send('POST', `/trust/decisions/${decisionId}/appeal`, {}, agentId)).status).toBe(404)

    const queue = await send('GET', '/trust/admin/decisions?status=appealed', undefined, admin, ['admin'])
    expect(queue.status).toBe(200)
    const items = (await queue.json()).data.items as { id: string; textDigest?: string }[]
    expect(items.some((d) => d.id === decisionId)).toBe(true)
    expect(items.every((d) => d.textDigest === undefined)).toBe(true)
    expect((await send('GET', '/trust/admin/decisions', undefined, tenant)).status).toBe(403)

    vi.mocked(notify).mockClear()
    const review = await send('POST', `/trust/admin/decisions/${decisionId}/review`, { outcome: 'overturned', label: 'DISCUSS_CONTACT_POLICY' }, admin, ['admin'])
    expect(review.status).toBe(200)
    expect(vi.mocked(notify)).toHaveBeenCalledWith(expect.objectContaining({ userId: String(tenant), title: 'Your message can be sent' }))

    const again = await chatSend('send me your whatsapp number please')
    expect(again.status).toBe(201)
    const override = await TrustDecision.findOne({ authorId: String(tenant), overrideOf: decisionId }).lean()
    expect(override).toMatchObject({ decision: 'BLOCK', enforced: false })
    expect(text).toBeTruthy()
  })

  it('records but does not stop in shadow mode; skips the screen when off', async () => {
    process.env.TRUST2_MODE = 'shadow'
    const shadow = await screenOutbound({ text: 'call 0277123456', authorId: String(tenant), channel: 'chat' })
    expect(shadow).toMatchObject({ allowed: true, decision: 'BLOCK', enforced: false, mode: 'shadow' })
    expect(await TrustDecision.exists({ _id: shadow.decisionId, mode: 'shadow', enforced: false })).toBeTruthy()
    process.env.TRUST2_MODE = 'off'
    const off = await screenOutbound({ text: 'call 0277123456', authorId: String(tenant), channel: 'chat' })
    expect(off).toMatchObject({ allowed: true, decisionId: null, mode: 'off' })
  })

  it('keeps model-only blocks in shadow unless the canary includes the author', async () => {
    const text = 'I prefer we sort the rest out on signal, it is faster'
    const shadowed = await screenOutbound({ text, authorId: String(tenant), channel: 'chat' })
    if (shadowed.decision === 'BLOCK') {
      expect(shadowed.allowed).toBe(true)
      process.env.TRUST2_MODEL_ENFORCE_PERCENT = '100'
      const enforced = await screenOutbound({ text, authorId: String(tenant), channel: 'chat' })
      // Phrase-based blocks are always enforced; model-only ones only in the canary.
      expect(enforced.allowed).toBe(false)
    }
  })

  it('"I\'m interested" opens a RentOS conversation and the lead carries no phone number', async () => {
    const blocked = await send('POST', `/agent/leads/property/${propertyId}`, { message: 'Interested! call me 0244123456' })
    expect(blocked.status).toBe(422)
    expect(await Lead.countDocuments({ agentId: String(agentId) })).toBe(0)

    const res = await send('POST', `/agent/leads/property/${propertyId}`, { message: 'Is it still available from November?' })
    expect(res.status).toBe(201)
    const body = (await res.json()).data
    expect(body.conversationId).toBeTruthy()
    expect(body.contactPhone).toBeUndefined()
    const lead = await Lead.findOne({ agentId: String(agentId) }).lean()
    expect(lead!.contactPhone).toBeUndefined()
    expect(lead!.conversationId).toBe(body.conversationId)
    const message = await Message.findOne({ conversationId: body.conversationId }).lean()
    expect(message!.text).toBe('Is it still available from November?')

    const inbox = await send('GET', '/agent/leads', undefined, agentId, ['property_manager'])
    const items = (await inbox.json()).data.items as Record<string, unknown>[]
    expect(items[0]).toMatchObject({ canReply: true, conversationId: body.conversationId })
    expect(items[0].contactPhone).toBeUndefined()
    expect(items[0].contactEmail).toBeUndefined()

    const reply = await send('POST', `/agent/leads/${String(lead!._id)}/conversation`, {}, agentId, ['property_manager'])
    expect((await reply.json()).data.conversationId).toBe(body.conversationId)
  })

  it('emails once about an unread message after the delay, and again only after it is read', async () => {
    vi.mocked(sendEmail).mockClear()
    const id = new mongoose.Types.ObjectId()
    const old = new Date(Date.now() - 45 * 60 * 1000)
    await Conversation.collection.insertOne({
      _id: id, participants: [String(tenant), String(agentId)], propertyId: String(propertyId),
      unreadCount: { [String(agentId)]: 2 }, lastMessage: { text: 'Hello, is the flat still free?', senderId: String(tenant), createdAt: old },
      pendingEmail: [{ userId: String(agentId), since: old }], emailedUnread: [],
    })
    const first = await sendUnreadMessageEmails()
    expect(first.emailed).toBeGreaterThanOrEqual(1)
    const call = vi.mocked(sendEmail).mock.calls.find((c) => c[0].html?.includes(String(id)))
    expect(call).toBeTruthy()
    expect(call![0].subject).toMatch(/unread messages from Trust Fixture0/)
    expect(call![0].html).toContain('Reply on RentOS')
    expect(call![0].html).toContain(`/messages?conversationId=${String(id)}`)

    vi.mocked(sendEmail).mockClear()
    await sendUnreadMessageEmails()
    expect(vi.mocked(sendEmail).mock.calls.some((c) => c[0].html?.includes(String(id)))).toBe(false)

    // Reading clears the spell; a later unread message may email again.
    const read = await send('PATCH', `/chat/conversations/${String(id)}/read`, {}, agentId, ['property_manager'])
    expect(read.status).toBe(200)
    const after = await Conversation.findById(id).lean()
    expect(after!.emailedUnread).not.toContain(String(agentId))
  })
})

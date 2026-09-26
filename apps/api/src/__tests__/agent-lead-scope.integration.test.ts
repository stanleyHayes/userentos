import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../services/notify.js', () => ({ notify: vi.fn().mockResolvedValue(undefined) }))

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { Property } = await import('../models/Property.js')
const { Lead } = await import('../models/Lead.js')
const { Viewing } = await import('../models/Viewing.js')
const { default: agentRouter } = await import('../routes/agent.js')
const { notify } = await import('../services/notify.js')

const uri = testMongoUri

describe.skipIf(!hasTestMongo)('viewing requests only advance the requester\'s own lead', () => {
  const agentId = String(new mongoose.Types.ObjectId())
  const prospectId = String(new mongoose.Types.ObjectId())
  const otherId = String(new mongoose.Types.ObjectId())
  let propertyId = ''
  let leadId = ''
  let server: Server
  let base = ''
  const requestViewing = (userId: string) => fetch(`${base}/agent/viewings/property/${propertyId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt.sign({ userId, roles: ['tenant'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ leadId, date: '2026-07-01', time: '10:00' }),
  })

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create([agentId, prospectId, otherId].map((id, i) => ({ _id: id, email: `lead-${id}@rentos.test`, phone: `02400000${50 + i}`, firstName: 'Lead', lastName: `User${i}`, passwordHash: 'fixture', roles: i ? ['tenant'] : ['landlord'], activeRole: i ? 'tenant' : 'landlord' })))
    const property = await Property.create({ landlordId: agentId, title: 'Lead fixture', description: 'Fixture', type: 'apartment', address: { street: '1 Lead St', city: 'Accra', region: 'Greater Accra' }, rentAmount: 1000, rentDurationMonths: 12, advanceMonths: 1 })
    propertyId = property.id
    const lead = await Lead.create({ propertyId, agentId, requesterId: prospectId, contactName: 'Lead User1', contactPhone: '0240000051' })
    leadId = lead.id
    const app = express()
    app.use(express.json())
    app.use('/agent', agentRouter)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Promise.all([
      User.deleteMany({ _id: { $in: [agentId, prospectId, otherId] } }),
      Property.deleteOne({ _id: propertyId }), Lead.deleteMany({ propertyId }), Viewing.deleteMany({ propertyId }),
    ])
    await mongoose.disconnect()
  })

  it('ignores a lead id belonging to someone else', async () => {
    expect((await requestViewing(otherId)).status).toBe(201)
    expect((await Lead.findById(leadId).lean())?.status).toBe('new')
  })

  it('advances the requester\'s own lead', async () => {
    expect((await requestViewing(prospectId)).status).toBe(201)
    expect((await Lead.findById(leadId).lean())?.status).toBe('viewing')
  })

  it("tells the agent about a lead or viewing without quoting the enquirer's name or phone", async () => {
    // Those stay on the lead, which is anonymised when the enquirer is erased;
    // a notification is kept for up to two years and never is.
    const res = await fetch(`${base}/agent/leads/property/${propertyId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt.sign({ userId: otherId, roles: ['tenant'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Is it still available?' }),
    })
    expect(res.status).toBe(201)
    const sent = vi.mocked(notify).mock.calls.map(([options]) => options)
    expect(sent.map((options) => options.title)).toEqual(expect.arrayContaining(['New Lead', 'Viewing Requested']))
    for (const options of sent) {
      expect(options.userId).toBe(agentId)
      expect(options.message).not.toMatch(/Lead User|02400000/)
    }
  })
})

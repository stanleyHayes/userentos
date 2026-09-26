import mongoose from 'mongoose'
import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CapabilityRecord } from '../models/CapabilityRecord.js'
import router from '../routes/capabilities.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

describe.skipIf(!hasTestMongo)('public off-plan developments', () => {
  const ownerId = String(new mongoose.Types.ObjectId())
  const participantId = String(new mongoose.Types.ObjectId())
  const adminId = String(new mongoose.Types.ObjectId())
  let recordId = ''
  let server: Server
  const url = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/cap/developer/offplan`

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    const inserted = await CapabilityRecord.collection.insertOne({
      kind: 'offplan_listing', ownerId, participantId, status: 'active', createdAt: new Date(), updatedAt: new Date(),
      data: { title: 'Sky Towers', amount: 450000, scheduledDate: '2027-06', reviewedBy: adminId, reviewedAt: new Date().toISOString(), reviewReason: 'internal moderation note' },
    })
    recordId = String(inserted.insertedId)
    const app = express(); app.use(express.json()); app.use('/cap', router)
    server = await new Promise<Server>(r => { const listener = app.listen(0, '127.0.0.1', () => r(listener)) })
  })
  afterAll(async () => {
    if (server) await new Promise<void>(r => server.close(() => r()))
    await CapabilityRecord.deleteMany({ ownerId })
    await mongoose.disconnect()
  })

  it('shows the development but not account ids or the review stamp', async () => {
    const res = await fetch(url())
    expect(res.status).toBe(200)
    const items = (await res.json()).data.items as Record<string, unknown>[]
    const item = items.find((i) => i.id === recordId)
    expect(item).toBeDefined()
    expect(item).toMatchObject({ status: 'active', data: { title: 'Sky Towers', amount: 450000, scheduledDate: '2027-06' } })
    expect(item).not.toHaveProperty('ownerId')
    expect(item).not.toHaveProperty('participantId')
    for (const field of ['reviewedBy', 'reviewedAt', 'reviewReason']) expect(item!.data, field).not.toHaveProperty(field)
    const body = JSON.stringify(item)
    for (const secret of [ownerId, participantId, adminId, 'internal moderation note']) expect(body).not.toContain(secret)
  })
})

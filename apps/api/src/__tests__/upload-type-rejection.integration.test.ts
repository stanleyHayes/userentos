import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

const { uploadToCloudinary } = vi.hoisted(() => ({ uploadToCloudinary: vi.fn() }))
vi.mock('../utils/cloudinary.js', async (orig) => ({ ...(await orig() as Record<string, unknown>), uploadToCloudinary }))
vi.mock('../services/notify.js', () => ({ notifyDisputeFiled: vi.fn(), notifyDisputeUpdate: vi.fn() }))
vi.mock('../services/webhooks.js', () => ({ dispatchWebhook: vi.fn() }))

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { Dispute } = await import('../models/Dispute.js')
const { errorHandler } = await import('../middleware/errorHandler.js')
const { errorTrackingHandler } = await import('../middleware/errorTracking.js')
const { default: uploadRouter } = await import('../routes/upload.js')
const { default: disputesRouter } = await import('../routes/disputes.js')

// A disallowed file type is the client's mistake: it used to surface as a 500
// "Internal server error" (and an errors.json entry) with no hint why.
describe.skipIf(!hasTestMongo)('rejected upload types', () => {
  const userId = String(new mongoose.Types.ObjectId())
  let disputeId = ''
  let server: Server
  let base = ''
  const post = async (path: string, field: string, mime: string, name: string) => {
    const form = new FormData()
    form.append(field, new Blob([new Uint8Array([1, 2, 3, 4])], { type: mime }), name)
    const token = jwt.sign({ userId, roles: ['tenant'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
    return { status: response.status, error: (await response.json() as { error?: string }).error }
  }

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await User.create({ _id: userId, email: `upload-type-${userId}@rentos.test`, phone: '0240000330', firstName: 'Up', lastName: 'Load', passwordHash: 'fixture', roles: ['tenant'], activeRole: 'tenant' })
    disputeId = (await Dispute.create({ filedBy: userId, filedAgainst: String(new mongoose.Types.ObjectId()), propertyId: 'upload-type-property', category: 'other', title: 'Leak', description: 'Evidence type check.' })).id
    const app = express()
    app.use(express.json())
    app.use('/upload', uploadRouter)
    app.use('/disputes', disputesRouter)
    app.use(errorTrackingHandler)
    app.use(errorHandler)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Promise.all([User.deleteOne({ _id: userId }), Dispute.deleteOne({ _id: disputeId })])
    await mongoose.disconnect()
  })

  it('answers /upload/single and /upload/multiple with a 400 and the allowed types', async () => {
    for (const [path, field] of [['/upload/single', 'file'], ['/upload/multiple', 'files']]) {
      const response = await post(path, field, 'text/html', 'page.html')
      expect(response.status).toBe(400)
      expect(response.error).toMatch(/^Only images/)
    }
    expect(uploadToCloudinary).not.toHaveBeenCalled()
  })

  it('answers a Word document offered as dispute evidence with a 400 and the reason', async () => {
    const response = await post(`/disputes/${disputeId}/evidence`, 'files', 'application/msword', 'statement.doc')
    expect(response.status).toBe(400)
    expect(response.error).toMatch(/allowed as evidence/)
  })
})

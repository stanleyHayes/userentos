import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import { mkdir, readdir, rmdir, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../services/notify.js', () => ({ notifyDisputeFiled: vi.fn(), notifyDisputeUpdate: vi.fn() }))
vi.mock('../services/webhooks.js', () => ({ dispatchWebhook: vi.fn() }))

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { Dispute } = await import('../models/Dispute.js')
const { errorHandler } = await import('../middleware/errorHandler.js')
const { default: disputesRouter } = await import('../routes/disputes.js')

const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'
const uploads = path.resolve('uploads')

describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('dispute evidence uploads', () => {
  const filerId = String(new mongoose.Types.ObjectId())
  const strangerId = String(new mongoose.Types.ObjectId())
  let disputeId = ''
  let createdUploadsDir = false
  let before = new Set<string>()
  let server: Server
  let base = ''
  const evidenceFiles = async () => (await readdir(uploads)).filter((f) => f.startsWith('evidence-'))
  const newFiles = async () => (await evidenceFiles()).filter((f) => !before.has(f))
  const upload = (userId: string, id: string, files = 2) => {
    const form = new FormData()
    for (let i = 0; i < files; i++) form.append('files', new Blob([new Uint8Array([137, 80, 78, 71, i])], { type: 'image/png' }), `photo-${i}.png`)
    const token = jwt.sign({ userId, roles: ['tenant'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })
    return fetch(`${base}/disputes/${id}/evidence`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

  beforeAll(async () => {
    await mongoose.connect(uri)
    if (!existsSync(uploads)) { await mkdir(uploads); createdUploadsDir = true }
    before = new Set(await evidenceFiles())
    await User.create([filerId, strangerId].map((id, i) => ({ _id: id, email: `evidence-${id}@rentos.test`, phone: `02400000${40 + i}`, firstName: 'Ev', lastName: `Idence${i}`, passwordHash: 'fixture', roles: ['tenant'], activeRole: 'tenant' })))
    const dispute = await Dispute.create({ filedBy: filerId, filedAgainst: String(new mongoose.Types.ObjectId()), propertyId: 'evidence-property', category: 'other', title: 'Leak', description: 'Water damage evidence.' })
    disputeId = dispute.id
    const app = express()
    app.use(express.json())
    app.use('/disputes', disputesRouter)
    app.use(errorHandler)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    for (const file of await newFiles()) await unlink(path.join(uploads, file)).catch(() => {})
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Promise.all([User.deleteMany({ _id: { $in: [filerId, strangerId] } }), Dispute.deleteOne({ _id: disputeId })])
    if (createdUploadsDir && (await readdir(uploads)).length === 0) await rmdir(uploads)
    await mongoose.disconnect()
  })

  it('rejects a non-party before anything is written to disk', async () => {
    expect((await upload(strangerId, disputeId)).status).toBe(403)
    await settle()
    expect(await newFiles()).toEqual([])
  })

  it.each([String(new mongoose.Types.ObjectId()), 'not-an-id'])('rejects a nonexistent dispute id (%s) without storing files', async (id) => {
    expect((await upload(filerId, id)).status).toBe(404)
    await settle()
    expect(await newFiles()).toEqual([])
  })

  it('deletes stored files when the request fails after upload', async () => {
    vi.spyOn(Dispute.prototype, 'save').mockRejectedValueOnce(new Error('write failed'))
    expect((await upload(filerId, disputeId)).status).toBe(500)
    await settle()
    expect(await newFiles()).toEqual([])
    expect((await Dispute.findById(disputeId).lean())?.evidence).toEqual([])
  })

  it('stores evidence for a party to the dispute', async () => {
    const response = await upload(filerId, disputeId, 1)
    expect(response.status).toBe(200)
    expect(await newFiles()).toHaveLength(1)
    expect((await Dispute.findById(disputeId).lean())?.evidence).toHaveLength(1)
  })
})

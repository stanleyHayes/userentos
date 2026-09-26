import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../services/notify.js', () => ({ notifyDisputeFiled: vi.fn(), notifyDisputeUpdate: vi.fn() }))
vi.mock('../services/webhooks.js', () => ({ dispatchWebhook: vi.fn() }))
vi.mock('../utils/cloudinary.js', () => ({
  uploadToCloudinary: vi.fn(),
  deleteFromCloudinary: vi.fn().mockResolvedValue({ result: 'ok' }),
  signedDownloadUrl: vi.fn((publicId: string) => `https://api.cloudinary.test/download?public_id=${publicId}&expires_at=60`),
}))

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { Dispute } = await import('../models/Dispute.js')
const { DocumentModel } = await import('../models/Document.js')
const { uploadToCloudinary, deleteFromCloudinary, signedDownloadUrl } = await import('../utils/cloudinary.js')
const { signDownloadToken } = await import('../services/authService.js')
const { errorHandler } = await import('../middleware/errorHandler.js')
const { default: disputesRouter } = await import('../routes/disputes.js')

describe.skipIf(!hasTestMongo)('dispute evidence is stored privately and served only to the parties', () => {
  const filerId = String(new mongoose.Types.ObjectId())
  const againstId = String(new mongoose.Types.ObjectId())
  const strangerId = String(new mongoose.Types.ObjectId())
  const mediatorId = String(new mongoose.Types.ObjectId())
  let disputeId = ''
  let server: Server
  let base = ''
  let uploads = 0
  const session = (userId: string, roles = ['tenant']) => jwt.sign({ userId, roles, permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })
  const upload = (userId: string, id: string, files = 2) => {
    const form = new FormData()
    for (let i = 0; i < files; i++) form.append('files', new Blob([new Uint8Array([137, 80, 78, 71, i])], { type: 'image/png' }), `photo-${i}.png`)
    return fetch(`${base}/disputes/${id}/evidence`, { method: 'POST', headers: { Authorization: `Bearer ${session(userId)}` }, body: form })
  }

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await User.create([filerId, againstId, strangerId, mediatorId].map((id, i) => ({
      _id: id, email: `evidence-${id}@rentos.test`, phone: `02400000${40 + i}`, firstName: 'Ev', lastName: `Idence${i}`, passwordHash: 'fixture',
      roles: [i === 3 ? 'legal_officer' : 'tenant'], activeRole: i === 3 ? 'legal_officer' : 'tenant',
    })))
    const dispute = await Dispute.create({ filedBy: filerId, filedAgainst: againstId, propertyId: 'evidence-property', category: 'other', title: 'Leak', description: 'Water damage evidence.' })
    disputeId = dispute.id
    const app = express()
    app.use(express.json())
    app.use('/disputes', disputesRouter)
    app.use(errorHandler)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  beforeEach(() => {
    vi.mocked(uploadToCloudinary).mockImplementation(async () => {
      uploads++
      return { url: `https://res.cloudinary.com/x/image/authenticated/s--sig--/v1/rentos/evidence/e${uploads}.png`, publicId: `rentos/evidence/e${uploads}`, format: 'png', bytes: 5 }
    })
  })
  afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks() })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Promise.all([
      User.deleteMany({ _id: { $in: [filerId, againstId, strangerId, mediatorId] } }),
      Dispute.deleteOne({ _id: disputeId }),
      DocumentModel.deleteMany({ linkedEntityId: disputeId }),
    ])
    await mongoose.disconnect()
  })

  it('rejects a non-party before anything is uploaded', async () => {
    expect((await upload(strangerId, disputeId)).status).toBe(403)
    expect(uploadToCloudinary).not.toHaveBeenCalled()
  })

  it.each([String(new mongoose.Types.ObjectId()), 'not-an-id'])('rejects a nonexistent dispute id (%s) without storing files', async (id) => {
    expect((await upload(filerId, id)).status).toBe(404)
    expect(uploadToCloudinary).not.toHaveBeenCalled()
  })

  it('erases uploaded files and their records when the request fails after upload', async () => {
    vi.spyOn(Dispute.prototype, 'save').mockRejectedValueOnce(new Error('write failed'))
    expect((await upload(filerId, disputeId)).status).toBe(500)
    expect(deleteFromCloudinary).toHaveBeenCalledTimes(2)
    expect(deleteFromCloudinary).toHaveBeenCalledWith(expect.stringMatching(/^rentos\/evidence\//), 'image', 'authenticated')
    expect(await DocumentModel.countDocuments({ linkedEntityId: disputeId })).toBe(0)
    expect((await Dispute.findById(disputeId).lean())?.evidence).toEqual([])
  })

  it('stores evidence privately as a tracked document, never on local disk', async () => {
    const response = await upload(filerId, disputeId, 1)
    expect(response.status).toBe(200)
    // The file arrives as an in-memory buffer (no disk storage) and goes to the host as private.
    expect(uploadToCloudinary).toHaveBeenCalledWith(expect.any(Buffer), { folder: 'evidence', resourceType: 'image', deliveryType: 'authenticated' })
    const [doc] = await DocumentModel.find({ linkedEntityId: disputeId }).lean()
    expect(doc).toMatchObject({
      type: 'evidence', linkedEntityType: 'dispute', ownerId: filerId, storagePublicId: expect.stringMatching(/^rentos\/evidence\//),
      storageDeliveryType: 'authenticated', storageFormat: 'png', accessControl: [filerId, againstId],
    })
    // The provider's own URL for an authenticated file is a permanent signed link: never stored.
    expect(doc.fileUrl).toBe(`/api/disputes/${disputeId}/evidence/${String(doc._id)}`)
    const [entry] = (await Dispute.findById(disputeId).lean())!.evidence
    expect(entry).toMatchObject({ documentId: String(doc._id), url: doc.fileUrl, type: 'image' })
  })

  it('serves the file to the parties and mediators through a signed, expiring link, and to no one else', async () => {
    const [doc] = await DocumentModel.find({ linkedEntityId: disputeId }).lean()
    const documentId = String(doc._id)
    const fileUrl = (userId: string) => `${base}/disputes/${disputeId}/evidence/${documentId}?token=${encodeURIComponent(signDownloadToken(userId))}`

    for (const party of [filerId, againstId, mediatorId]) {
      const res = await fetch(fileUrl(party), { redirect: 'manual' })
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toContain(`public_id=${doc.storagePublicId}`)
    }
    expect(signedDownloadUrl).toHaveBeenCalledWith(doc.storagePublicId, 'png', 'image')
    expect((await fetch(fileUrl(strangerId), { redirect: 'manual' })).status).toBe(403)
    expect((await fetch(`${base}/disputes/${disputeId}/evidence/${documentId}`, { redirect: 'manual' })).status).toBe(401)
    // A session token is not a download token.
    expect((await fetch(`${base}/disputes/${disputeId}/evidence/${documentId}?token=${session(filerId)}`, { redirect: 'manual' })).status).toBe(401)

    const link = await fetch(`${base}/disputes/${disputeId}/evidence/${documentId}/link`, { method: 'POST', headers: { Authorization: `Bearer ${session(againstId)}` } })
    expect(link.status).toBe(200)
    expect((await link.json()).data.token).toEqual(expect.any(String))
    expect((await fetch(`${base}/disputes/${disputeId}/evidence/${documentId}/link`, { method: 'POST', headers: { Authorization: `Bearer ${session(strangerId)}` } })).status).toBe(403)
  })
})

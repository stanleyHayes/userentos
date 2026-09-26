import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

const { uploadToCloudinary } = vi.hoisted(() => ({
  uploadToCloudinary: vi.fn(async () => ({ url: 'https://res.cloudinary.test/doc.pdf', publicId: 'documents/doc', bytes: 5 })),
}))
vi.mock('../utils/cloudinary.js', async (orig) => ({ ...(await orig() as Record<string, unknown>), uploadToCloudinary }))

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { DocumentModel } = await import('../models/Document.js')
const { AuditLog } = await import('../models/AuditLog.js')
const { errorHandler } = await import('../middleware/errorHandler.js')
const { default: documentsRouter } = await import('../routes/documents.js')

describe.skipIf(!hasTestMongo)('document access and uploads', () => {
  const ids = { owner: '', victim: '', gov: '', admin: '' }
  for (const key of Object.keys(ids) as (keyof typeof ids)[]) ids[key] = String(new mongoose.Types.ObjectId())
  let identityDocId = ''
  let server: Server
  let base = ''
  const auth = (userId: string, roles: string[]) => ({ Authorization: `Bearer ${jwt.sign({ userId, roles, permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}` })
  const get = async (path: string, userId: string, roles: string[]) => {
    const response = await fetch(`${base}${path}`, { headers: auth(userId, roles) })
    return { status: response.status, body: await response.json() as { data: { items?: { id: string; ownerId: string }[] } } }
  }
  const upload = async (fields: Record<string, string>, mime = 'application/pdf') => {
    const form = new FormData()
    form.append('file', new Blob([new TextEncoder().encode('%PDF-')], { type: mime }), 'file.pdf')
    for (const [key, value] of Object.entries(fields)) form.append(key, value)
    const response = await fetch(`${base}/documents`, { method: 'POST', headers: auth(ids.owner, ['tenant']), body: form })
    return { status: response.status, body: await response.json() as { data?: { id: string; accessControl: string[]; type: string }; error?: string } }
  }

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    const roleOf: Record<keyof typeof ids, string> = { owner: 'tenant', victim: 'tenant', gov: 'government', admin: 'admin' }
    await User.create((Object.keys(ids) as (keyof typeof ids)[]).map((key, i) => ({ _id: ids[key], email: `docs-${ids[key]}@rentos.test`, phone: `02400002${10 + i}`, firstName: 'Doc', lastName: key, passwordHash: 'fixture', roles: [roleOf[key]], activeRole: roleOf[key] })))
    const identity = await DocumentModel.create({ ownerId: ids.victim, name: 'Ghana Card', type: 'identity', mimeType: 'image/png', fileUrl: 'https://res.cloudinary.test/card.png', fileSize: 10, accessControl: [ids.victim] })
    identityDocId = String(identity._id)
    const app = express()
    app.use(express.json())
    app.use('/documents', documentsRouter)
    app.use(errorHandler)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  beforeEach(() => uploadToCloudinary.mockClear())
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Promise.all([
      User.deleteMany({ _id: { $in: Object.values(ids) } }),
      DocumentModel.deleteMany({ ownerId: { $in: Object.values(ids) } }),
      AuditLog.deleteMany({ userId: { $in: Object.values(ids) } }),
    ])
    await mongoose.disconnect()
  })

  it("keeps other people's documents, identity scans included, from government accounts", async () => {
    const list = await get('/documents', ids.gov, ['government'])
    expect(list.status).toBe(200)
    expect(list.body.data.items!.map((d) => d.id)).not.toContain(identityDocId)
    expect((await get(`/documents/${identityDocId}/versions`, ids.gov, ['government'])).status).toBe(403)
    expect((await get(`/documents/${identityDocId}/audit`, ids.gov, ['government'])).status).toBe(403)
  })

  it('still gives administrators and the owner access', async () => {
    expect((await get('/documents', ids.admin, ['admin'])).body.data.items!.map((d) => d.id)).toContain(identityDocId)
    expect((await get(`/documents/${identityDocId}/versions`, ids.admin, ['admin'])).status).toBe(200)
    expect((await get('/documents', ids.victim, ['tenant'])).body.data.items!.map((d) => d.id)).toEqual([identityDocId])
  })

  it('rejects a type outside the model enum before anything is uploaded', async () => {
    const response = await upload({ type: 'lease' })
    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Invalid document type')
    expect(uploadToCloudinary).not.toHaveBeenCalled()
  })

  it('stores an enum type the web now sends', async () => {
    const response = await upload({ type: 'rental_agreement', name: 'Lease' })
    expect(response.status).toBe(201)
    expect(response.body.data!.type).toBe('rental_agreement')
  })

  it("ignores a client accessControl list, so nobody can push files into another user's Documents", async () => {
    const response = await upload({ type: 'rental_agreement', name: 'Lease renewal – sign now', accessControl: JSON.stringify([ids.victim]) })
    expect(response.status).toBe(201)
    expect(response.body.data!.accessControl).toEqual([ids.owner])
    const victimList = await get('/documents', ids.victim, ['tenant'])
    expect(victimList.body.data.items!.map((d) => d.id)).not.toContain(response.body.data!.id)
  })
})

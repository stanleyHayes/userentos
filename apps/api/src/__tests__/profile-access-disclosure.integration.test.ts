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
const { ProfileAccess } = await import('../models/ProfileAccess.js')
const { default: profileAccessRouter } = await import('../routes/profileAccess.js')

const uri = testMongoUri

describe.skipIf(!hasTestMongo)('profile access disclosure', () => {
  const landlordId = String(new mongoose.Types.ObjectId())
  const otherLandlordId = String(new mongoose.Types.ObjectId())
  const tenantId = String(new mongoose.Types.ObjectId())
  let server: Server
  let base = ''
  const headers = (userId: string, roles: string[]) => ({ Authorization: `Bearer ${jwt.sign({ userId, roles, permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`, 'Content-Type': 'application/json' })
  const asLandlord = headers(landlordId, ['landlord'])
  const call = async (path: string, h: Record<string, string>, body?: unknown) => {
    const response = await fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: response.status, body: await response.json() as { data?: unknown } }
  }
  const outgoing = async () => ((await call('/profile-access/requests', asLandlord)).body.data as Record<string, unknown>[])

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create([
      { _id: landlordId, email: `pa-landlord-${landlordId}@rentos.test`, phone: '0240000011', firstName: 'Req', lastName: 'Uester', passwordHash: 'fixture', roles: ['landlord'], activeRole: 'landlord' },
      { _id: otherLandlordId, email: `pa-other-${otherLandlordId}@rentos.test`, phone: '0240000012', firstName: 'Oth', lastName: 'Er', passwordHash: 'fixture', roles: ['landlord'], activeRole: 'landlord' },
      { _id: tenantId, email: `pa-tenant-${tenantId}@rentos.test`, phone: '0240000013', firstName: 'Ten', lastName: 'Ant', passwordHash: 'fixture', roles: ['tenant'], activeRole: 'tenant' },
    ])
    const app = express()
    app.use(express.json())
    app.use('/profile-access', profileAccessRouter)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await ProfileAccess.deleteMany({ requesterId: landlordId })
    await User.deleteMany({ _id: { $in: [landlordId, otherLandlordId, tenantId] } })
    await mongoose.disconnect()
  })

  it('only tenant accounts can be targeted', async () => {
    expect((await call('/profile-access/request', asLandlord, { tenantId: otherLandlordId })).status).toBe(404)
    expect((await call('/profile-access/request', asLandlord, { tenantId: 'not-an-id' })).status).toBe(404)
    expect(await ProfileAccess.countDocuments({ requesterId: landlordId })).toBe(0)
  })

  it('withholds the tenant email until the tenant approves', async () => {
    const created = await call('/profile-access/request', asLandlord, { tenantId, message: 'Screening for Unit 4' })
    expect(created.status).toBe(201)
    const id = (created.body.data as { id: string }).id

    const [pending] = await outgoing()
    expect(pending.status).toBe('pending')
    expect(pending.tenantEmail).toBeUndefined()

    expect((await call(`/profile-access/${id}/respond`, headers(tenantId, ['tenant']), { action: 'approve' })).status).toBe(200)
    const [approved] = await outgoing()
    expect(approved.tenantEmail).toBe(`pa-tenant-${tenantId}@rentos.test`)

    expect((await call(`/profile-access/${id}/revoke`, headers(tenantId, ['tenant']), {})).status).toBe(200)
    const [revoked] = await outgoing()
    expect(revoked.tenantEmail).toBeUndefined()
  })
})

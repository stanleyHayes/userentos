import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { TenantProfile } from '../models/TenantProfile.js'
import { ProfileAccess } from '../models/ProfileAccess.js'
import usersRouter from '../routes/users.js'
import tenantProfileRouter from '../routes/tenantProfile.js'
import { encryptLegacyPii } from '../scripts/encryptPiiFields.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

const uri = testMongoUri

describe.skipIf(!hasTestMongo)('national ID protection at rest and in responses', () => {
  const tenantId = String(new mongoose.Types.ObjectId())
  const landlordId = String(new mongoose.Types.ObjectId())
  const legacyId = String(new mongoose.Types.ObjectId())
  let server: Server
  let base = ''
  const headers = (userId: string, roles: string[]) => ({ Authorization: `Bearer ${jwt.sign({ userId, roles, permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`, 'Content-Type': 'application/json' })
  const asTenant = headers(tenantId, ['tenant'])
  const asLandlord = headers(landlordId, ['landlord'])
  const call = async (path: string, h: Record<string, string>, method = 'GET', body?: unknown) => {
    const response = await fetch(`${base}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: response.status, data: (await response.json() as { data: Record<string, unknown> }).data }
  }
  const raw = (collection: string, userId: string, byUserId = true) => mongoose.connection.collection(collection).findOne(byUserId ? { userId } : { _id: new mongoose.Types.ObjectId(userId) })

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create([
      { _id: tenantId, email: `pii-tenant-${tenantId}@rentos.test`, phone: '0240000031', firstName: 'Pii', lastName: 'Tenant', passwordHash: 'fixture', roles: ['tenant'], activeRole: 'tenant' },
      { _id: landlordId, email: `pii-landlord-${landlordId}@rentos.test`, phone: '0240000032', firstName: 'Pii', lastName: 'Landlord', passwordHash: 'fixture', roles: ['landlord'], activeRole: 'landlord' },
    ])
    await ProfileAccess.create({ requesterId: landlordId, tenantId, status: 'approved', requestedAt: new Date() })
    const app = express()
    app.use(express.json())
    app.use('/users', usersRouter)
    app.use('/tenant-profile', tenantProfileRouter)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Promise.all([
      User.deleteMany({ _id: { $in: [tenantId, landlordId] } }),
      TenantProfile.deleteMany({ userId: { $in: [tenantId, legacyId] } }),
      ProfileAccess.deleteMany({ requesterId: landlordId }),
    ])
    await mongoose.disconnect()
  })

  it('stores the Ghana Card and profile ID number encrypted but returns them to their owner', async () => {
    expect((await call('/users/me', asTenant, 'PATCH', { ghanaCardId: 'GHA-111222333-4' })).status).toBe(200)
    await call('/tenant-profile/me', asTenant)
    const patched = await call('/tenant-profile/me', asTenant, 'PATCH', { idType: 'ghana_card', idNumber: 'GHA-111222333-4', idDocumentUrl: '/uploads/card.jpg', selfieUrl: '/uploads/me.jpg', spouseName: 'Esi', maritalStatus: 'married' })
    expect(patched.data.idNumber).toBe('GHA-111222333-4')

    const storedUser = await raw('users', tenantId, false)
    const storedProfile = await raw('tenantprofiles', tenantId)
    expect(String(storedUser?.ghanaCardId)).toMatch(/^pii:v1\./)
    expect(String(storedProfile?.idNumber)).toMatch(/^pii:v1\./)
    expect(JSON.stringify([storedUser, storedProfile])).not.toContain('111222333')

    expect((await call('/users/me', asTenant)).data.ghanaCardId).toBe('GHA-111222333-4')
    expect((await call('/tenant-profile/me', asTenant)).data.idNumber).toBe('GHA-111222333-4')

    const exported = await call('/users/me/export', asTenant)
    expect((exported.data.user as Record<string, unknown>).ghanaCardId).toBe('GHA-111222333-4')
    expect(exported.data.tenantProfile).toMatchObject({ idNumber: 'GHA-111222333-4', idDocumentUrl: '/uploads/card.jpg', selfieUrl: '/uploads/me.jpg', spouseName: 'Esi' })
  })

  it('gives a landlord with approved access only verification status and the last four digits', async () => {
    const { status, data } = await call(`/tenant-profile/${tenantId}`, asLandlord)
    expect(status).toBe(200)
    expect(data).toMatchObject({ idType: 'ghana_card', idVerified: false, idNumberLast4: '3334' })
    for (const hidden of ['idNumber', 'idDocumentUrl', 'selfieUrl', 'spouseName', 'maritalStatus', 'hasSpouse', 'hasChildren', 'numberOfDependents']) {
      expect(data).not.toHaveProperty(hidden)
    }
    expect(JSON.stringify(data)).not.toContain('111222333')
  })

  it('keeps legacy plaintext readable and the backfill encrypts it in place', async () => {
    await mongoose.connection.collection('tenantprofiles').insertOne({ userId: legacyId, idType: 'ghana_card', idNumber: 'GHA-999888777-6', idVerified: true })
    expect((await encryptLegacyPii({ userIds: [legacyId] })).profiles).toBe(1)
    const stored = await raw('tenantprofiles', legacyId)
    expect(String(stored?.idNumber)).toMatch(/^pii:v1\./)
    const profile = await TenantProfile.findOne({ userId: legacyId }).lean()
    const { ownProfileView } = await import('../services/tenantProfileViews.js')
    expect(ownProfileView(profile!).idNumber).toBe('GHA-999888777-6')
    expect((await encryptLegacyPii({ userIds: [legacyId] })).profiles).toBe(0)
  })
})

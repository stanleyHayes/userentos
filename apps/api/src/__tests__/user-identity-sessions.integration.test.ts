import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { RefreshToken } from '../models/RefreshToken.js'
import usersRouter from '../routes/users.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

const uri = testMongoUri

describe.skipIf(!hasTestMongo)('identity edits and role changes', () => {
  const userId = String(new mongoose.Types.ObjectId())
  const adminId = String(new mongoose.Types.ObjectId())
  let server: Server
  let base = ''
  const token = (id: string, roles: string[], sessionVersion = 0) => jwt.sign({ userId: id, roles, permissions: [], sessionVersion, purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })
  const headers = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' })
  const patchMe = async (body: unknown) => {
    const response = await fetch(`${base}/users/me`, { method: 'PATCH', headers: headers(token(userId, ['tenant'])), body: JSON.stringify(body) })
    return { status: response.status, body: await response.json() as { data?: Record<string, unknown>; error?: string } }
  }
  const verified = { firstName: 'Ama', lastName: 'Mensah', ghanaCardId: 'GHA-123456789-0', isVerified: true, verificationStatus: 'verified' as const }

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create([
      { _id: userId, email: `identity-${userId}@rentos.test`, phone: '0240000021', passwordHash: 'fixture', roles: ['tenant', 'landlord'], activeRole: 'tenant', ...verified },
      { _id: adminId, email: `identity-admin-${adminId}@rentos.test`, phone: '0240000022', firstName: 'Super', lastName: 'Admin', passwordHash: 'fixture', roles: ['super_admin'], activeRole: 'super_admin' },
    ])
    const app = express()
    app.use(express.json())
    app.use('/users', usersRouter)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  beforeEach(async () => {
    await User.updateOne({ _id: userId }, { $set: { ...verified, roles: ['tenant', 'landlord'], activeRole: 'tenant', sessionVersion: 0 } })
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Promise.all([User.deleteMany({ _id: { $in: [userId, adminId] } }), RefreshToken.deleteMany({ userId })])
    await mongoose.disconnect()
  })

  it('keeps verification when identity fields are re-sent unchanged', async () => {
    const { status } = await patchMe({ firstName: 'Ama', lastName: 'Mensah', ghanaCardId: 'GHA-123456789-0', phone: '0240000099' })
    expect(status).toBe(200)
    expect(await User.findById(userId).lean()).toMatchObject({ isVerified: true, verificationStatus: 'verified', phone: '0240000099' })
  })

  it.each([
    ['first name', { firstName: 'Akosua' }],
    ['last name', { lastName: 'Owusu' }],
    ['Ghana Card', { ghanaCardId: 'gha-987654321-1' }],
    ['cleared Ghana Card', { ghanaCardId: '' }],
  ])('resets verification when the %s changes', async (_label, body) => {
    const { status } = await patchMe(body)
    expect(status).toBe(200)
    expect(await User.findById(userId).lean()).toMatchObject({ isVerified: false, verificationStatus: 'none' })
  })

  it('cancels a pending review when the card under review is replaced', async () => {
    await User.updateOne({ _id: userId }, { $set: { isVerified: false, verificationStatus: 'pending' } })
    expect((await patchMe({ ghanaCardId: 'GHA-555555555-5' })).status).toBe(200)
    expect((await User.findById(userId).lean())?.verificationStatus).toBe('none')
  })

  it('normalises Ghana Card case, rejects malformed PINs and lets the owner clear it', async () => {
    const saved = await patchMe({ ghanaCardId: ' gha-987654321-1 ' })
    expect(saved.body.data?.ghanaCardId).toBe('GHA-987654321-1')
    for (const bad of ['GHA-12345-1', '123456789', 'GHA-123456789-01', 42]) {
      expect((await patchMe({ ghanaCardId: bad })).status).toBe(400)
    }
    const cleared = await patchMe({ ghanaCardId: null })
    expect(cleared.status).toBe(200)
    expect(cleared.body.data?.ghanaCardId).toBeUndefined()
    expect((await User.findById(userId).lean())?.ghanaCardId).toBeUndefined()
  })

  it('invalidates existing sessions when an admin changes roles', async () => {
    const oldToken = token(userId, ['tenant', 'landlord'])
    await RefreshToken.create({ userId, tokenHash: `identity-${userId}`, expiresAt: new Date(Date.now() + 3_600_000) })
    const change = (roles: string[]) => fetch(`${base}/users/${userId}/permissions`, { method: 'PATCH', headers: headers(token(adminId, ['super_admin'])), body: JSON.stringify({ roles }) })

    // Re-sending the same roles is not a change and keeps sessions alive.
    expect((await change(['landlord', 'tenant'])).status).toBe(200)
    expect((await fetch(`${base}/users/me`, { headers: headers(oldToken) })).status).toBe(200)

    expect((await change(['tenant'])).status).toBe(200)
    expect((await fetch(`${base}/users/me`, { headers: headers(oldToken) })).status).toBe(401)
    expect((await RefreshToken.findOne({ userId }).lean())?.revokedReason).toBe('permissions_changed')
    expect((await fetch(`${base}/users/me`, { headers: headers(token(userId, ['tenant'], 1)) })).status).toBe(200)
  })
})

import mongoose from 'mongoose'
import express from 'express'
import bcrypt from 'bcryptjs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { User } from '../models/User.js'
import { AuditLog } from '../models/AuditLog.js'
import { Wallet } from '../models/Wallet.js'
import { RefreshToken } from '../models/RefreshToken.js'
import authRouter from '../routes/auth.js'
import { TERMS_VERSION, PRIVACY_VERSION } from '../types/index.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

const uri = testMongoUri

describe.skipIf(!hasTestMongo)('consent capture (real Mongo)', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const newEmail = `consent-new-${stamp}@rentos.test`
  const legacyEmail = `consent-legacy-${stamp}@rentos.test`
  const password = 'Str0ng!Pass'
  const acceptance = { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, ageConfirmed: true }
  let server: Server, base: string
  const post = (path: string, body: unknown, token?: string) => fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'consent-integration/1.0', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create({ email: legacyEmail, phone: '0241234567', firstName: 'Legacy', lastName: 'User', passwordHash: await bcrypt.hash(password, 4), roles: ['tenant'], activeRole: 'tenant' })
    const app = express(); app.use(express.json()); app.use('/auth', authRouter)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/auth`
  })

  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    const users = await User.find({ email: { $in: [newEmail, legacyEmail] } }).select('_id').lean()
    const ids = users.map(u => u._id.toString())
    await Promise.all([
      User.deleteMany({ _id: { $in: ids } }),
      AuditLog.deleteMany({ userId: { $in: ids } }),
      Wallet.deleteMany({ userId: { $in: ids } }),
      RefreshToken.deleteMany({ userId: { $in: ids } }),
    ])
    await mongoose.disconnect()
  })

  it('refuses registration without acceptance and writes nothing', async () => {
    const res = await post('/register', { email: newEmail, phone: '0241234567', password, firstName: 'New', lastName: 'User', role: 'tenant' })
    expect(res.status).toBe(400)
    expect(await User.exists({ email: newEmail })).toBeNull()
  })

  it('stores the consent evidence on registration and audits it', async () => {
    const res = await post('/register', { email: newEmail, phone: '0241234567', password, firstName: 'New', lastName: 'User', role: 'tenant', acceptance })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.user.consentRequired).toBe(false)

    const stored = await User.findOne({ email: newEmail }).lean()
    expect(stored?.consents).toMatchObject({ termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, ageConfirmed: true, userAgent: 'consent-integration/1.0' })
    expect(stored?.consents?.acceptedAt).toBeInstanceOf(Date)
    expect(stored?.consents?.ip).toBeTruthy()
    await expect.poll(() => AuditLog.countDocuments({ userId: stored!._id.toString(), action: 'consent.accept' })).toBe(1)
  })

  it('flags an account that predates consent capture at login, and clears it once accepted', async () => {
    const login = await (await post('/login', { email: legacyEmail, password })).json()
    expect(login.data.user.consentRequired).toBe(true)

    const accepted = await post('/consents', acceptance, login.data.token)
    expect(accepted.status).toBe(200)
    expect((await accepted.json()).data.consentRequired).toBe(false)

    const again = await (await post('/login', { email: legacyEmail, password })).json()
    expect(again.data.user.consentRequired).toBe(false)
    const stored = await User.findOne({ email: legacyEmail }).lean()
    expect(stored?.consents?.termsVersion).toBe(TERMS_VERSION)
  })
})

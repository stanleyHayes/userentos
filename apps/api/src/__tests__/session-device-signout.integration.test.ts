import crypto from 'node:crypto'
import mongoose from 'mongoose'
import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AuthService, signDownloadToken } from '../services/authService.js'
import { authenticateDownload } from '../middleware/auth.js'
import biometricRouter from '../routes/biometricAuth.js'
import { User } from '../models/User.js'
import { RefreshToken, hashRefreshToken } from '../models/RefreshToken.js'
import { BiometricToken } from '../models/BiometricToken.js'
import { DeviceToken } from '../models/DeviceToken.js'
import { RevokedSession } from '../models/RevokedSession.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'
import { accepts, nextEvent, recordEvents, startRealtime, type Realtime } from './sessionTestKit.js'
import { revokeAccountSessions } from '../services/sessionRevocation.js'

vi.mock('../services/notify.js', () => ({ notify: vi.fn(), notifyWelcome: vi.fn().mockResolvedValue(true) }))
vi.mock('../utils/audit.js', () => ({ recordAuditEntry: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../middleware/rateLimit.js', () => ({ loginLimiter: (_req: Request, _res: Response, next: NextFunction) => next() }))
vi.mock('../models/Conversation.js', () => ({ Conversation: { find: () => ({ select: () => ({ lean: async () => [] }) }) } }))
vi.mock('../services/userBlocks.js', () => ({ blockedContacts: async () => new Set(), contactBlocked: async () => false }))

/*
 * Signing one device out (logout, revoking one biometric device) must end
 * that device's access token and socket at once, not up to 15 minutes later,
 * and leave the account's other devices alone.
 */
const uri = testMongoUri
const PASSWORD = 'Fixture!Passw0rd'
const sidOf = (token: string) => (jwt.decode(token) as { sid: string }).sid

describe.skipIf(!hasTestMongo)('per-device sign-out', () => {
  const owners: string[] = []
  const sids: string[] = []
  const repo = { findByEmail: (email: string) => User.findOne({ email }), findById: (id: string) => User.findById(id) }
  const service = new AuthService(repo as never, {} as never, { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never)
  let realtime: Realtime
  let http: Server, base: string

  beforeAll(async () => {
    await mongoose.connect(uri)
    realtime = await startRealtime()
    const app = express(); app.use(express.json()); app.use('/biometric', biometricRouter)
    http = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    await realtime.close()
    await new Promise<void>(resolve => http.close(() => resolve()))
    const filter = { userId: { $in: owners } }
    await Promise.all([User.deleteMany({ _id: { $in: owners } }), RefreshToken.deleteMany(filter), BiometricToken.deleteMany(filter), DeviceToken.deleteMany(filter), RevokedSession.deleteMany({ sid: { $in: sids } })])
    await mongoose.disconnect()
  })

  async function account(label: string) {
    const userId = new mongoose.Types.ObjectId().toString()
    await User.create({ _id: userId, email: `signout-${label}-${userId}@example.test`, phone: 'fixture', firstName: 'Signout', lastName: 'Fixture', passwordHash: await bcrypt.hash(PASSWORD, 4), roles: ['tenant'], activeRole: 'tenant' })
    owners.push(userId)
    return userId
  }
  async function signIn(userId: string) {
    const result = await service.login((await User.findById(userId).lean())!.email, PASSWORD)
    const tokens = result.data as { token: string; refreshToken: string }
    sids.push(sidOf(tokens.token))
    return tokens
  }

  it('account closure: the device that closed it disconnects quietly, the others are told the account was closed', async () => {
    const userId = await account('closure')
    const a = await signIn(userId)
    const b = await signIn(userId)
    const socketA = await realtime.open(a.token)
    const socketB = await realtime.open(b.token)
    const seenA = recordEvents(socketA)
    const seenB = recordEvents(socketB)
    const ended = Promise.all([nextEvent(socketA, 'disconnect'), nextEvent(socketB, 'disconnect')])
    await revokeAccountSessions(userId, 'gdpr_deletion', { notice: 'account:closed', quietSid: sidOf(a.token) })
    await ended
    // A shows its own "Your account is closed"; a sign-out notice first would log it out mid-flow.
    expect(seenA).not.toContain('account:closed')
    expect(seenA).not.toContain('session:revoked')
    expect(seenB).toContain('account:closed')
    expect(seenB).not.toContain('session:revoked')
  })

  it("logout rejects that device's access token and closes only its socket", async () => {
    const userId = await account('logout')
    const a = await signIn(userId)
    const b = await signIn(userId)
    const socketA = await realtime.open(a.token)
    const socketB = await realtime.open(b.token)
    const seenB = recordEvents(socketB)
    const seenA = recordEvents(socketA)
    const ended = nextEvent(socketA, 'disconnect')

    await service.logout(a.refreshToken)
    await ended
    // The device signed itself out, so its socket closes without 'session:revoked'.
    expect(seenA).not.toContain('session:revoked')
    expect(await accepts(a.token)).toBe(false)
    expect(await accepts(a.token, true)).toBe(false)
    expect((await realtime.open(a.token, true)).connected).toBe(false)
    expect(await service.refresh(a.refreshToken)).toMatchObject({ status: 401 })

    expect(socketB.connected).toBe(true)
    expect(seenB).toEqual([])
    expect(await accepts(b.token)).toBe(true)
    expect((await service.refresh(b.refreshToken)).data).toBeDefined()
    expect((await User.findById(userId).lean())?.sessionVersion ?? 0).toBe(0)
  })

  it('logout with a token a concurrent refresh already rotated still signs that device out', async () => {
    const userId = await account('logout-race')
    const a = await signIn(userId)
    const rotated = (await service.refresh(a.refreshToken)).data!
    await service.logout(a.refreshToken)
    expect(await RefreshToken.findOne({ tokenHash: hashRefreshToken(rotated.refreshToken) }).lean()).toMatchObject({ revokedReason: 'logout' })
    expect(await accepts(rotated.token)).toBe(false)
  })

  it("revoking one biometric device rejects that device's access token and closes only its socket", async () => {
    const userId = await account('biometric')
    const ordinary = await signIn(userId)
    const plain = crypto.randomBytes(48).toString('base64url')
    const familyId = crypto.randomUUID()
    sids.push(familyId)
    await BiometricToken.create({ userId, tokenHash: crypto.createHash('sha256').update(plain).digest('hex'), deviceId: 'device-0001', familyId, expiresAt: new Date(Date.now() + 3_600_000) })
    const exchanged = await fetch(`${base}/biometric/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: plain, deviceId: 'device-0001' }) })
    const biometric = (await exchanged.json() as { data: { token: string } }).data
    expect(sidOf(biometric.token)).toBe(familyId)
    const socketBio = await realtime.open(biometric.token)
    const socketOrdinary = await realtime.open(ordinary.token)
    const ended = Promise.all([nextEvent(socketBio, 'session:revoked'), nextEvent(socketBio, 'disconnect')])

    // The listed record has since been rotated by that exchange; revoking it still ends the enrollment.
    const listed = await BiometricToken.findOne({ tokenHash: crypto.createHash('sha256').update(plain).digest('hex') }).lean()
    const response = await fetch(`${base}/biometric/devices/${listed!._id}/revoke`, { method: 'POST', headers: { Authorization: `Bearer ${ordinary.token}` } })
    expect(response.status).toBe(200)
    await ended
    expect(await BiometricToken.countDocuments({ familyId, revokedAt: { $exists: false } })).toBe(0)
    expect(await accepts(biometric.token)).toBe(false)
    expect(socketOrdinary.connected).toBe(true)
    expect(await accepts(ordinary.token)).toBe(true)
    expect((await User.findById(userId).lean())?.biometricVersion ?? 0).toBe(0)
  })

  it('binds download links to the session that minted them', async () => {
    const userId = await account('download')
    const a = await signIn(userId)
    async function downloads(token: string) {
      const req = { headers: {}, query: { token }, method: 'GET', originalUrl: '/api/agreements/x/document.pdf' } as unknown as Request
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
      const next = vi.fn()
      await authenticateDownload('agreement-document')(req, res as unknown as Response, next)
      return next.mock.calls.length > 0
    }
    const beforeLogout = signDownloadToken('agreement-document', userId, 0, sidOf(a.token))
    expect(await downloads(beforeLogout)).toBe(true)
    await service.logout(a.refreshToken)
    expect(await downloads(beforeLogout)).toBe(false)

    const b = await signIn(userId)
    const beforeLogoutAll = signDownloadToken('agreement-document', userId, 0, sidOf(b.token))
    await service.logoutAll(userId)
    expect(await downloads(beforeLogoutAll)).toBe(false)
    expect(await downloads(signDownloadToken('agreement-document', userId, 1))).toBe(true)
  })
})

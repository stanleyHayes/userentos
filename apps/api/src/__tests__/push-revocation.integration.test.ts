import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import type { Request, Response } from 'express'
import { User } from '../models/User.js'
import { config } from '../config/index.js'
import { authenticate, optionalAuth } from '../middleware/auth.js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AuthService } from '../services/authService.js'
import { DeviceToken } from '../models/DeviceToken.js'
import { RefreshToken, hashRefreshToken } from '../models/RefreshToken.js'
import { BiometricToken } from '../models/BiometricToken.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../services/notify.js', () => ({ notifyWelcome: vi.fn() }))
const uri = testMongoUri
describe.skipIf(!hasTestMongo)('push registration revocation', () => {
  const prefix = `push-revoke-${new mongoose.Types.ObjectId()}`
  const owners: string[] = []
  const service = new AuthService({} as never, {} as never, { info: vi.fn(), warn: vi.fn() } as never)
  beforeAll(async () => { await mongoose.connect(uri) })
  afterAll(async () => {
    const filter = { userId: { $in: owners } }
    await Promise.all([
      User.deleteMany({ _id: { $in: owners } }),
      DeviceToken.deleteMany(filter),
      RefreshToken.deleteMany(filter),
      BiometricToken.deleteMany(filter),
    ])
    await mongoose.disconnect()
  })
  async function fixture(label: string) {
    const userId = new mongoose.Types.ObjectId().toString()
    const otherId = new mongoose.Types.ObjectId().toString()
    await User.create({ _id: userId, email: `${prefix}-${label}@example.test`, phone: 'fixture', firstName: 'Fixture', lastName: 'User', passwordHash: 'fixture', roles: ['tenant'], activeRole: 'tenant' })
    owners.push(userId, otherId)
    const plain = `${userId}-refresh`
    const expiresAt = new Date(Date.now() + 3600000)
    await DeviceToken.create([
      { userId, token: `${userId}-expo`, platform: 'expo' },
      { userId, token: `${userId}-fcm`, platform: 'fcm' },
      { userId: otherId, token: `${otherId}-expo`, platform: 'expo' },
    ])
    await RefreshToken.create({ userId, tokenHash: hashRefreshToken(plain), expiresAt })
    await BiometricToken.create({ userId, tokenHash: `${userId}-bio`, deviceId: 'fixture', expiresAt })
    return { userId, otherId, plain }
  }
  it('logout-all removes every owned push registration and retains another account', async () => {
    const { userId, otherId } = await fixture('all')
    await service.logoutAll(userId)
    expect(await DeviceToken.countDocuments({ userId })).toBe(0)
    expect(await DeviceToken.countDocuments({ userId: otherId })).toBe(1)
    expect((await RefreshToken.findOne({ userId }))?.revokedReason).toBe('logout_all')
    expect((await BiometricToken.findOne({ userId }))?.revokedReason).toBe('logout_all')
    await service.logoutAll(userId)
    expect(await DeviceToken.countDocuments({ userId: otherId })).toBe(1)
  })
  it('replayed refresh credentials remove push registrations through the shared revoker', async () => {
    const { userId, otherId, plain } = await fixture('replay')
    // Rotated longer ago than the grace window for a retried request.
    await RefreshToken.updateOne({ userId }, { $set: { revokedAt: new Date(Date.now() - 60_000), revokedReason: 'rotated' } })
    expect(await service.refresh(plain)).toMatchObject({ status: 401 })
    expect(await DeviceToken.countDocuments({ userId })).toBe(0)
    expect(await DeviceToken.countDocuments({ userId: otherId })).toBe(1)
    expect((await BiometricToken.findOne({ userId }))?.revokedReason).toBe('replay_detected')
  })
  it('single-session logout preserves registrations on other devices', async () => {
    const { userId, plain } = await fixture('single')
    await service.logout(plain)
    expect(await DeviceToken.countDocuments({ userId })).toBe(2)
    expect((await RefreshToken.findOne({ userId }))?.revokedReason).toBe('logout')
  })
  it('rejects legacy and old access tokens after revocation but accepts the new version', async () => {
    const { userId } = await fixture('access')
    async function request(version: number | undefined, optional = false) {
      const token = jwt.sign({ userId, roles: ['tenant'], purpose: 'session', sessionVersion: version }, config.jwtSecret, { expiresIn: 300 })
      const req = { headers: { authorization: `Bearer ${token}` }, method: 'GET', originalUrl: '/api/auth/me' } as Request
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
      const next = vi.fn()
      await (optional ? optionalAuth : authenticate)(req, res as unknown as Response, next)
      return { req, res, next }
    }
    expect((await request(undefined)).req.user?.userId).toBe(userId)
    await service.logoutAll(userId)
    expect((await User.findById(userId))?.sessionVersion).toBe(1)
    for (const version of [undefined, 0]) {
      const result = await request(version)
      expect(result.res.status).toHaveBeenCalledWith(401)
      expect(result.next).not.toHaveBeenCalled()
      expect((await request(version, true)).req.user).toBeUndefined()
    }
    expect((await request(1)).req.user?.userId).toBe(userId)
    await User.updateOne({ _id: userId }, { $set: { suspendedAt: new Date() } })
    expect((await request(0)).res.status).toHaveBeenCalledWith(401)
  })

  it('rejects a stale credential persisted after logout-all cleanup', async () => {
    const { userId } = await fixture('late-refresh')
    await service.logoutAll(userId)
    const plain = `${userId}-late`
    await RefreshToken.create({ userId, tokenHash: hashRefreshToken(plain), sessionVersion: 0, expiresAt: new Date(Date.now() + 3600000) })
    const auth = new AuthService({ findById: (id: string) => User.findById(id) } as never, {} as never, { info: vi.fn(), warn: vi.fn() } as never)
    expect(await auth.refresh(plain)).toMatchObject({ status: 401 })
    expect(await RefreshToken.countDocuments({ userId, revokedAt: { $exists: false } })).toBe(0)
  })
  it('retains the originating generation when refresh issuance overlaps logout-all', async () => {
    const { userId, plain } = await fixture('refresh-race')
    let release!: () => void
    let loaded!: () => void
    const reached = new Promise<void>(resolve => { loaded = resolve })
    const resume = new Promise<void>(resolve => { release = resolve })
    const repo = { findById: vi.fn(async (id: string) => {
      const user = await User.findById(id)
      loaded()
      await resume
      return user
    }) }
    const auth = new AuthService(repo as never, {} as never, { info: vi.fn(), warn: vi.fn() } as never)
    const pending = auth.refresh(plain)
    await reached
    await service.logoutAll(userId)
    release()
    const result = await pending
    expect(result.data).toBeDefined()
    const successor = result.data!.refreshToken
    const stored = await RefreshToken.findOne({ tokenHash: hashRefreshToken(successor) })
    expect(stored?.sessionVersion).toBe(0)
    expect(jwt.decode(result.data!.token)).toMatchObject({ sessionVersion: 0 })
    repo.findById.mockImplementation(async id => User.findById(id))
    expect(await auth.refresh(successor)).toMatchObject({ status: 401 })
  })
  it('rotates current credentials without losing their nonzero generation', async () => {
    const { userId } = await fixture('current-refresh')
    await service.logoutAll(userId)
    const plain = `${userId}-current`
    await RefreshToken.create({ userId, tokenHash: hashRefreshToken(plain), sessionVersion: 1, expiresAt: new Date(Date.now() + 3600000) })
    const auth = new AuthService({ findById: (id: string) => User.findById(id) } as never, {} as never, { info: vi.fn(), warn: vi.fn() } as never)
    const result = await auth.refresh(plain)
    expect(jwt.decode(result.data!.token)).toMatchObject({ sessionVersion: 1 })
    expect((await RefreshToken.findOne({ tokenHash: hashRefreshToken(result.data!.refreshToken) }))?.sessionVersion).toBe(1)
    expect((await auth.refresh(result.data!.refreshToken)).data).toBeDefined()
  })

  it('biometric revocation rejects biometric access while preserving ordinary access', async () => {
    const { userId } = await fixture('biometric-only')
    async function accepts(biometricVersion: number | undefined) {
      const token = jwt.sign({ userId, roles: ['tenant'], purpose: 'session', sessionVersion: 0, biometricVersion }, config.jwtSecret, { expiresIn: 300 })
      const req = { headers: { authorization: `Bearer ${token}` }, method: 'GET', originalUrl: '/api/auth/me' } as Request
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
      const next = vi.fn()
      await authenticate(req, res as unknown as Response, next)
      return next.mock.calls.length > 0
    }
    expect(await accepts(0)).toBe(true)
    await User.updateOne({ _id: userId }, { $inc: { biometricVersion: 1 } })
    expect(await accepts(0)).toBe(false)
    expect(await accepts(undefined)).toBe(true)
    expect(await accepts(1)).toBe(true)
    expect((await User.findById(userId))?.sessionVersion).toBe(0)
  })

})

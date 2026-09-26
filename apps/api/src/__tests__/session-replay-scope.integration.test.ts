import crypto from 'node:crypto'
import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AuthService } from '../services/authService.js'
import biometricRouter from '../routes/biometricAuth.js'
import { User } from '../models/User.js'
import { RefreshToken, hashRefreshToken } from '../models/RefreshToken.js'
import { BiometricToken } from '../models/BiometricToken.js'
import { DeviceToken } from '../models/DeviceToken.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../services/notify.js', () => ({ notify: vi.fn(), notifyWelcome: vi.fn() }))
vi.mock('../middleware/rateLimit.js', () => ({ loginLimiter: (_req: Request, _res: Response, next: NextFunction) => next() }))

/*
 * Replay detection must only fire for a token that was rotated away, once:
 * treating every revoked token as theft let any stale device (or an attacker
 * holding an evicted token) sign the account out everywhere, repeatedly.
 */
const uri = testMongoUri
const ago = (ms: number) => new Date(Date.now() - ms)
const hour = () => new Date(Date.now() + 3_600_000)

describe.skipIf(!hasTestMongo)('refresh and biometric replay scope', () => {
  const owners: string[] = []
  const service = new AuthService({ findById: (id: string) => User.findById(id) } as never, {} as never, { info: vi.fn(), warn: vi.fn() } as never)
  let server: Server, base: string

  beforeAll(async () => {
    await mongoose.connect(uri)
    const app = express(); app.use(express.json()); app.use('/biometric', biometricRouter)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
    const filter = { userId: { $in: owners } }
    await Promise.all([User.deleteMany({ _id: { $in: owners } }), RefreshToken.deleteMany(filter), BiometricToken.deleteMany(filter), DeviceToken.deleteMany(filter)])
    await mongoose.disconnect()
  })

  async function account() {
    const userId = new mongoose.Types.ObjectId().toString()
    await User.create({ _id: userId, email: `replay-${userId}@example.test`, phone: 'fixture', firstName: 'Replay', lastName: 'Fixture', passwordHash: 'fixture', roles: ['tenant'], activeRole: 'tenant' })
    owners.push(userId)
    return userId
  }
  const generation = async (userId: string) => {
    const user = await User.findById(userId).lean()
    return { session: user?.sessionVersion ?? 0, biometric: user?.biometricVersion ?? 0 }
  }

  describe('refresh tokens', () => {
    async function refreshToken(userId: string, fields: Record<string, unknown> = {}) {
      const plain = crypto.randomBytes(32).toString('base64url')
      await RefreshToken.create({ userId, tokenHash: hashRefreshToken(plain), sessionVersion: 0, familyId: crypto.randomUUID(), expiresAt: hour(), ...fields })
      return plain
    }

    it.each(['logout', 'logout_all', 'credentials_changed', 'permissions_changed', 'mfa_changed', 'gdpr_deletion', 'session_revoked'])('refuses a %s-revoked token with no side effects', async reason => {
      const userId = await account()
      const current = await refreshToken(userId)
      const dead = await refreshToken(userId, { revokedAt: ago(3_600_000), revokedReason: reason })
      await DeviceToken.create({ userId, token: `${userId}-push`, platform: 'expo' })
      expect(await service.refresh(dead)).toMatchObject({ status: 401 })
      expect(await generation(userId)).toEqual({ session: 0, biometric: 0 })
      expect(await DeviceToken.countDocuments({ userId })).toBe(1)
      expect((await service.refresh(current)).data).toBeDefined()
    })

    it('revokes every session once for a rotated token presented again; a second presentation is inert', async () => {
      const userId = await account()
      const stolen = await refreshToken(userId, { revokedAt: ago(120_000), revokedReason: 'rotated' })
      expect(await service.refresh(stolen)).toMatchObject({ status: 401 })
      expect((await generation(userId)).session).toBe(1)
      expect(await RefreshToken.findOne({ tokenHash: hashRefreshToken(stolen) }).lean()).toMatchObject({ revokedReason: 'replay_detected', replayDetectedAt: expect.any(Date) })
      const signedInAgain = await refreshToken(userId, { sessionVersion: 1 })
      expect(await service.refresh(stolen)).toMatchObject({ status: 401 })
      expect((await generation(userId)).session).toBe(1)
      expect((await service.refresh(signedInAgain)).data).toBeDefined()
    })

    it('answers a token rotated inside the grace window once, with a fresh pair, and retires its successor', async () => {
      const userId = await account()
      const first = await refreshToken(userId)
      const rotated = await service.refresh(first)
      expect(rotated.data).toBeDefined()
      // A retry after a lost response, or a second tab: signed in, not signed out.
      const retried = await service.refresh(first)
      expect(retried.data?.refreshToken).toBeDefined()
      expect(retried.data!.refreshToken).not.toBe(rotated.data!.refreshToken)
      expect((await generation(userId)).session).toBe(0)
      // The successor it replaced is dead, quietly.
      expect(await service.refresh(rotated.data!.refreshToken)).toMatchObject({ status: 401 })
      expect((await generation(userId)).session).toBe(0)
      expect((await service.refresh(retried.data!.refreshToken)).data).toBeDefined()
      // Only once: a second retry is refused, still without revoking anything.
      expect(await service.refresh(first)).toMatchObject({ status: 401 })
      expect((await generation(userId)).session).toBe(0)
    })

    it('does not re-issue within the grace window once that session has signed out', async () => {
      const userId = await account()
      const first = await refreshToken(userId)
      const rotated = await service.refresh(first)
      await service.logout(rotated.data!.refreshToken)
      expect(await service.refresh(first)).toMatchObject({ status: 401 })
      expect((await generation(userId)).session).toBe(0)
    })

    it('does not count a rotated token from a generation that is already revoked', async () => {
      const userId = await account()
      const evicted = await refreshToken(userId, { revokedAt: ago(120_000), revokedReason: 'rotated' })
      await service.logoutAll(userId)
      const signedInAgain = await refreshToken(userId, { sessionVersion: 1 })
      expect(await service.refresh(evicted)).toMatchObject({ status: 401 })
      expect((await generation(userId)).session).toBe(1)
      expect((await service.refresh(signedInAgain)).data).toBeDefined()
    })

    it('does not later treat a token refused for its stale generation as a rotated one', async () => {
      const userId = await account()
      await User.updateOne({ _id: userId }, { $set: { sessionVersion: 1 } })
      const stale = await refreshToken(userId, { sessionVersion: 0 })
      expect(await service.refresh(stale)).toMatchObject({ status: 401 })
      expect(await RefreshToken.findOne({ tokenHash: hashRefreshToken(stale) }).lean()).toMatchObject({ revokedReason: 'session_revoked' })
      await RefreshToken.updateOne({ tokenHash: hashRefreshToken(stale) }, { $set: { revokedAt: ago(120_000) } })
      expect(await service.refresh(stale)).toMatchObject({ status: 401 })
      expect((await generation(userId)).session).toBe(1)
    })

    it('carries the session family through rotation as the access token sid, starting one for older tokens', async () => {
      const userId = await account()
      const plain = await refreshToken(userId, { familyId: 'family-fixture' })
      const rotated = (await service.refresh(plain)).data!
      expect(jwt.decode(rotated.token)).toMatchObject({ sid: 'family-fixture' })
      expect(await RefreshToken.findOne({ tokenHash: hashRefreshToken(rotated.refreshToken) }).lean()).toMatchObject({ familyId: 'family-fixture' })
      const legacy = await refreshToken(userId, { familyId: undefined })
      const started = (await service.refresh(legacy)).data!
      const sid = (jwt.decode(started.token) as { sid?: string }).sid
      expect(sid).toEqual(expect.any(String))
      expect(await RefreshToken.findOne({ tokenHash: hashRefreshToken(started.refreshToken) }).lean()).toMatchObject({ familyId: sid })
    })
  })

  describe('biometric tokens', () => {
    const exchange = (refreshToken: string, deviceId = 'device-0001') => fetch(`${base}/biometric/exchange`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken, deviceId }),
    })
    async function biometricToken(userId: string, fields: Record<string, unknown> = {}) {
      const plain = crypto.randomBytes(48).toString('base64url')
      await BiometricToken.create({ userId, tokenHash: crypto.createHash('sha256').update(plain).digest('hex'), deviceId: 'device-0001', familyId: crypto.randomUUID(), expiresAt: hour(), ...fields })
      return plain
    }

    it.each(['user_revoked', 'user_revoked_all', 'replaced_by_new_enrollment', 'logout_all', 'credentials_changed', 'session_revoked'])('refuses a %s token without revoking other devices', async reason => {
      const userId = await account()
      const other = await biometricToken(userId, { deviceId: 'device-0002' })
      const dead = await biometricToken(userId, { revokedAt: ago(3_600_000), revokedReason: reason })
      expect((await exchange(dead)).status).toBe(401)
      expect(await generation(userId)).toEqual({ session: 0, biometric: 0 })
      expect((await exchange(other, 'device-0002')).status).toBe(200)
    })

    it('revokes biometric sessions once for a rotated token presented again; a second presentation is inert', async () => {
      const userId = await account()
      const stolen = await biometricToken(userId, { revokedAt: ago(120_000), revokedReason: 'rotated' })
      const other = await biometricToken(userId, { deviceId: 'device-0002' })
      expect((await exchange(stolen)).status).toBe(401)
      expect(await generation(userId)).toEqual({ session: 0, biometric: 1 })
      expect((await exchange(other, 'device-0002')).status).toBe(401)
      const enrolledAgain = await biometricToken(userId, { deviceId: 'device-0003', biometricVersion: 1 })
      expect((await exchange(stolen)).status).toBe(401)
      expect((await generation(userId)).biometric).toBe(1)
      expect((await exchange(enrolledAgain, 'device-0003')).status).toBe(200)
    })

    it('answers a token rotated inside the grace window once on the same device and retires its successor', async () => {
      const userId = await account()
      const first = await biometricToken(userId, { familyId: 'bio-family' })
      const response = await exchange(first)
      expect(response.status).toBe(200)
      const { data } = await response.json() as { data: { token: string; refreshToken: string } }
      expect(jwt.decode(data.token)).toMatchObject({ sid: 'bio-family', biometricVersion: 0 })
      const retried = await exchange(first)
      expect(retried.status).toBe(200)
      const { data: again } = await retried.json() as { data: { token: string; refreshToken: string } }
      expect(jwt.decode(again.token)).toMatchObject({ sid: 'bio-family' })
      expect((await exchange(data.refreshToken)).status).toBe(401)
      expect((await exchange(first)).status).toBe(401)
      expect((await generation(userId)).biometric).toBe(0)
      expect((await exchange(again.refreshToken)).status).toBe(200)
    })

    it('does not re-issue a just-rotated token presented from another device', async () => {
      const userId = await account()
      const first = await biometricToken(userId, { familyId: 'bio-family-2' })
      expect((await exchange(first)).status).toBe(200)
      expect((await exchange(first, 'device-9999')).status).toBe(401)
      expect((await generation(userId)).biometric).toBe(0)
    })

    it("does not let a presentation from another device burn the real device's token", async () => {
      const userId = await account()
      const plain = await biometricToken(userId)
      expect((await exchange(plain, 'device-9999')).status).toBe(401)
      expect((await exchange(plain)).status).toBe(200)
      expect((await generation(userId)).biometric).toBe(0)
    })
  })
})

import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthService } from '../services/authService.js'
import { notify } from '../services/notify.js'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { RefreshToken } from '../models/RefreshToken.js'
import { BiometricToken } from '../models/BiometricToken.js'
import { DeviceToken } from '../models/DeviceToken.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'
import { accepts, nextEvent, recordEvents, startRealtime, type Realtime } from './sessionTestKit.js'

vi.mock('../services/notify.js', () => ({ notify: vi.fn(), notifyWelcome: vi.fn().mockResolvedValue(true) }))
vi.mock('../utils/audit.js', () => ({ recordAuditEntry: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../utils/totp.js', async importActual => ({ ...await importActual<typeof import('../utils/totp.js')>(), verifyTotp: () => true }))
vi.mock('../models/Conversation.js', () => ({ Conversation: { find: () => ({ select: () => ({ lean: async () => [] }) }) } }))
vi.mock('../services/userBlocks.js', () => ({ blockedContacts: async () => new Set(), contactBlocked: async () => false }))

/*
 * A password or two-factor change signs every other session out and keeps
 * the device that made it signed in with a fresh pair. A password reset
 * (unauthenticated) still signs out everywhere.
 */
const uri = testMongoUri
const PASSWORD = 'Old!Passw0rd'
const sidOf = (token: string) => (jwt.decode(token) as { sid: string }).sid

describe.skipIf(!hasTestMongo)('credential changes keep the current device signed in', () => {
  const owners: string[] = []
  const repo = {
    findByEmail: (email: string) => User.findOne({ email }),
    findById: (id: string, options?: { select?: string }) => options?.select ? User.findById(id).select(options.select) : User.findById(id),
  }
  const service = new AuthService(repo as never, {} as never, { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never)
  let realtime: Realtime

  beforeAll(async () => {
    await mongoose.connect(uri)
    realtime = await startRealtime()
  })
  beforeEach(() => { vi.mocked(notify).mockClear() })
  afterAll(async () => {
    await realtime.close()
    const filter = { userId: { $in: owners } }
    await Promise.all([User.deleteMany({ _id: { $in: owners } }), RefreshToken.deleteMany(filter), BiometricToken.deleteMany(filter), DeviceToken.deleteMany(filter)])
    await mongoose.disconnect()
  })

  async function account(label: string) {
    const userId = new mongoose.Types.ObjectId().toString()
    await User.create({ _id: userId, email: `renew-${label}-${userId}@example.test`, phone: 'fixture', firstName: 'Renew', lastName: 'Fixture', passwordHash: await bcrypt.hash(PASSWORD, 4), roles: ['tenant'], activeRole: 'tenant' })
    owners.push(userId)
    return userId
  }
  async function signIn(userId: string, device: string) {
    const user = await User.findById(userId).lean()
    const result = await service.login(user!.email, PASSWORD, device)
    return result.data as { token: string; refreshToken: string }
  }
  const sessionVersion = async (userId: string) => (await User.findById(userId).lean())?.sessionVersion ?? 0

  it('password change signs other devices out and gives this device a working pair at the new generation', async () => {
    const userId = await account('password')
    const a = await signIn(userId, 'Device A')
    const b = await signIn(userId, 'Device B')
    const socketA = await realtime.open(a.token)
    const socketB = await realtime.open(b.token)
    const seenA = recordEvents(socketA)
    const ended = Promise.all([nextEvent(socketA, 'disconnect'), nextEvent(socketB, 'session:revoked'), nextEvent(socketB, 'disconnect')])

    const result = await service.changePassword(userId, PASSWORD, 'N3w!Passw0rd', undefined, { sid: sidOf(a.token), deviceLabel: 'Device A' })
    const renewed = result.data!
    expect(renewed).toMatchObject({ token: expect.any(String), refreshToken: expect.any(String) })
    expect(jwt.decode(renewed.token)).toMatchObject({ purpose: 'session', sessionVersion: 1, sid: expect.any(String) })
    await ended
    // This device's socket closed quietly: a sign-out notice would have logged it out.
    expect(seenA).toEqual(['disconnect'])

    expect(await accepts(renewed.token)).toBe(true)
    expect(await accepts(a.token)).toBe(false)
    expect(await accepts(b.token)).toBe(false)
    for (const stale of [a.refreshToken, b.refreshToken]) expect(await service.refresh(stale)).toMatchObject({ status: 401 })
    // Presenting the revoked tokens did not cascade into another revocation.
    expect(await sessionVersion(userId)).toBe(1)
    expect((await service.refresh(renewed.refreshToken)).data).toBeDefined()
    expect((await realtime.open(renewed.token)).connected).toBe(true)
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('your other devices were signed out') }))
  })

  it('enabling and disabling two-factor authentication sign other devices out and renew this one', async () => {
    const userId = await account('mfa')
    const a = await signIn(userId, 'Device A')
    const b = await signIn(userId, 'Device B')
    await User.updateOne({ _id: userId }, { $set: { mfaSecret: 'JBSWY3DPEHPK3PXP' } })

    const enabled = (await service.mfaEnable(userId, '123456', undefined, { sid: sidOf(a.token) })).data!
    expect(await sessionVersion(userId)).toBe(1)
    expect(jwt.decode(enabled.token)).toMatchObject({ sessionVersion: 1 })
    expect(await accepts(enabled.token)).toBe(true)
    expect(await accepts(b.token)).toBe(false)
    expect(await service.refresh(b.refreshToken)).toMatchObject({ status: 401 })
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('your other devices were signed out') }))

    // Device B signs in again, now with the second factor.
    const challenge = (await service.login((await User.findById(userId).lean())!.email, PASSWORD)).data as { mfaToken: string }
    const b2 = (await service.verifyMfaLogin(challenge.mfaToken, '123456', 'Device B')).data as { token: string; refreshToken: string }
    const socketB2 = await realtime.open(b2.token)
    const revoked = nextEvent(socketB2, 'session:revoked')

    const disabled = (await service.mfaDisable(userId, '123456', undefined, { sid: sidOf(enabled.token) })).data!
    await revoked
    expect(await sessionVersion(userId)).toBe(2)
    expect(await accepts(disabled.token)).toBe(true)
    expect(await accepts(enabled.token)).toBe(false)
    expect(await accepts(b2.token)).toBe(false)
    expect(await service.refresh(b2.refreshToken)).toMatchObject({ status: 401 })
    expect((await service.refresh(disabled.refreshToken)).data).toBeDefined()
    expect(await sessionVersion(userId)).toBe(2)
  })

  it('password reset signs every device out, the resetting one included, and issues no session', async () => {
    const userId = await account('reset')
    const a = await signIn(userId, 'Device A')
    const socketA = await realtime.open(a.token)
    const revoked = nextEvent(socketA, 'session:revoked')
    const resetToken = jwt.sign({ userId, purpose: 'reset' }, config.jwtSecret, { expiresIn: 3600 })
    const result = await service.resetPassword(resetToken, 'N3w!Passw0rd')
    expect(result).toMatchObject({ data: null, message: 'Password reset successfully' })
    await revoked
    expect(await accepts(a.token)).toBe(false)
    expect(await service.refresh(a.refreshToken)).toMatchObject({ status: 401 })
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('signed out on all devices') }))
  })

  it('logout-all tells the other devices they were signed out and closes this one quietly', async () => {
    const userId = await account('logout-all')
    const a = await signIn(userId, 'Device A')
    const b = await signIn(userId, 'Device B')
    const socketA = await realtime.open(a.token)
    const socketB = await realtime.open(b.token)
    const seenA = recordEvents(socketA)
    const ended = Promise.all([nextEvent(socketA, 'disconnect'), nextEvent(socketB, 'session:revoked')])
    await service.logoutAll(userId, sidOf(a.token))
    await ended
    expect(seenA).toEqual(['disconnect'])
    expect(await accepts(b.token)).toBe(false)
  })
})

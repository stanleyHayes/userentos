import { EventEmitter } from 'node:events'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { User } from '../models/User.js'
import { RevokedSession } from '../models/RevokedSession.js'
import { config } from '../config/index.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'
import { nextEvent, recordEvents, startRealtime, type Realtime } from './sessionTestKit.js'

const conversations = vi.hoisted(() => ({ resolve: null as null | ((value: unknown) => void) }))
vi.mock('../models/Conversation.js', () => ({ Conversation: {
  find: () => ({ select: () => ({ lean: async () => [] }) }),
  // Held open until the test resolves it, to finish a join after a disconnect.
  findById: () => ({ select: () => ({ lean: () => new Promise(resolve => { conversations.resolve = resolve }) }) }),
} }))
vi.mock('../services/userBlocks.js', () => ({ blockedContacts: async () => new Set(), contactBlocked: async () => false }))

/*
 * A socket must not outlive its session just because this instance never
 * called disconnect for it: a revocation on another instance, a direct
 * database edit or a code path that forgot. The change-stream watcher, the
 * periodic sweep and the per-packet re-check each close that gap.
 */
const uri = testMongoUri
const HOUR = 3_600_000
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
async function until(check: () => unknown, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting')
    await sleep(10)
  }
}

describe.skipIf(!hasTestMongo)('socket revalidation', () => {
  const owners: string[] = []
  const sids: string[] = []
  beforeAll(async () => { await mongoose.connect(uri) })
  afterAll(async () => {
    await Promise.all([User.deleteMany({ _id: { $in: owners } }), RevokedSession.deleteMany({ sid: { $in: sids } })])
    await mongoose.disconnect()
  })

  async function account() {
    const userId = new mongoose.Types.ObjectId().toString()
    await User.create({ _id: userId, email: `revalidate-${userId}@example.test`, phone: 'fixture', firstName: 'Revalidate', lastName: 'Fixture', passwordHash: 'fixture', roles: ['tenant'], activeRole: 'tenant' })
    owners.push(userId)
    return userId
  }
  function token(userId: string, claims: { biometricVersion?: number; sid?: string } = {}) {
    if (claims.sid) sids.push(claims.sid)
    return jwt.sign({ userId, purpose: 'session', sessionVersion: 0, ...claims }, config.jwtSecret, { expiresIn: 300 })
  }

  describe('change-stream watcher alone', () => {
    let realtime: Realtime
    beforeAll(async () => { realtime = await startRealtime({ revalidateIntervalMs: HOUR, packetRecheckMs: HOUR }) })
    afterAll(async () => { await realtime.close() })

    it('closes a socket after a raw sessionVersion bump, telling the client first', async () => {
      const userId = await account()
      const bystander = await realtime.open(token(await account()))
      const client = await realtime.open(token(userId))
      const seen = recordEvents(client)
      const closed = nextEvent(client, 'disconnect')
      await User.updateOne({ _id: userId }, { $inc: { sessionVersion: 1 } })
      await closed
      expect(seen).toEqual(['session:revoked', 'disconnect'])
      expect(bystander.connected).toBe(true)
    })

    it('a biometricVersion bump closes only the biometric sockets', async () => {
      const userId = await account()
      const ordinary = await realtime.open(token(userId))
      const biometric = await realtime.open(token(userId, { biometricVersion: 0 }))
      const closed = nextEvent(biometric, 'session:revoked')
      await User.updateOne({ _id: userId }, { $inc: { biometricVersion: 1 } })
      await closed
      await sleep(100)
      expect(ordinary.connected).toBe(true)
    })

    it('closes a socket whose account was hard-deleted, telling it the account was closed', async () => {
      const userId = await account()
      const client = await realtime.open(token(userId))
      const revoked = nextEvent(client, 'account:closed')
      await User.deleteOne({ _id: userId })
      await revoked
    })

    it('sends account:suspended, not session:revoked, when the account is suspended', async () => {
      const userId = await account()
      const client = await realtime.open(token(userId))
      const seen = recordEvents(client)
      const closed = nextEvent(client, 'disconnect')
      await User.updateOne({ _id: userId }, { $set: { suspendedAt: new Date() } })
      await closed
      expect(seen).toEqual(['account:suspended', 'disconnect'])
    })

    it('leaves the socket alone for an unrelated profile update', async () => {
      const userId = await account()
      const client = await realtime.open(token(userId))
      await User.updateOne({ _id: userId }, { $set: { firstName: 'Renamed' } })
      // Change events arrive in order: once a later revocation lands, the edit has been seen.
      const barrierId = await account()
      const barrier = await realtime.open(token(barrierId))
      const barrierClosed = nextEvent(barrier, 'disconnect')
      await User.updateOne({ _id: barrierId }, { $inc: { sessionVersion: 1 } })
      await barrierClosed
      expect(client.connected).toBe(true)
    })

    it("closes only the signed-out device's socket when its session is listed", async () => {
      const userId = await account()
      const signedOut = await realtime.open(token(userId, { sid: 'watch-device-a' }))
      const other = await realtime.open(token(userId, { sid: 'watch-device-b' }))
      const revoked = nextEvent(signedOut, 'session:revoked')
      await RevokedSession.create({ sid: 'watch-device-a', expiresAt: new Date(Date.now() + HOUR) })
      await revoked
      await sleep(100)
      expect(other.connected).toBe(true)
    })
  })

  describe('periodic sweep alone', () => {
    let realtime: Realtime
    beforeAll(async () => { realtime = await startRealtime({ watchChanges: false, revalidateIntervalMs: 200, packetRecheckMs: HOUR }) })
    afterAll(async () => { await realtime.close() })

    it('closes a socket within the sweep interval after a hard delete, telling it the account was closed', async () => {
      const userId = await account()
      const client = await realtime.open(token(userId))
      const revoked = nextEvent(client, 'account:closed')
      await User.deleteOne({ _id: userId })
      await revoked
    })

    it('closes a socket after a raw sessionVersion bump and a signed-out device, keeping the rest', async () => {
      const userId = await account()
      const bumped = await realtime.open(token(userId))
      const otherId = await account()
      const signedOut = await realtime.open(token(otherId, { sid: 'sweep-device-a' }))
      const kept = await realtime.open(token(otherId, { sid: 'sweep-device-b' }))
      const ended = Promise.all([nextEvent(bumped, 'session:revoked'), nextEvent(signedOut, 'session:revoked')])
      await User.updateOne({ _id: userId }, { $inc: { sessionVersion: 1 } })
      await RevokedSession.create({ sid: 'sweep-device-a', expiresAt: new Date(Date.now() + HOUR) })
      await ended
      await User.updateOne({ _id: otherId }, { $set: { firstName: 'Renamed' } })
      await sleep(500)
      expect(kept.connected).toBe(true)
    })

    // A guard, not a regression: Socket.IO 4.8 already turns join into a no-op on close.
    it('does not join a conversation room for a socket that closed while the lookup ran', async () => {
      const userId = await account()
      const client = await realtime.open(token(userId))
      const socketId = client.id!
      conversations.resolve = null
      client.emit('join:conversation', 'conversation-fixture')
      await until(() => conversations.resolve)
      client.disconnect()
      await until(() => !realtime.server.of('/').sockets.has(socketId))
      conversations.resolve!({ participants: [userId, 'someone-else'] })
      await sleep(50)
      expect(realtime.server.of('/').adapter.rooms.get('chat:conversation-fixture')?.has(socketId) ?? false).toBe(false)
    })
  })

  describe('per-packet re-check alone', () => {
    let realtime: Realtime
    beforeAll(async () => { realtime = await startRealtime({ watchChanges: false, revalidateIntervalMs: HOUR, packetRecheckMs: 0 }) })
    afterAll(async () => { await realtime.close() })

    it('refuses a packet from a revoked session before any sweep runs', async () => {
      const userId = await account()
      const client = await realtime.open(token(userId))
      const answered = nextEvent(client, 'online:list')
      client.emit('get:online')
      expect(await answered).toEqual([])
      await User.updateOne({ _id: userId }, { $inc: { sessionVersion: 1 } })
      const seen = recordEvents(client)
      const closed = nextEvent(client, 'disconnect')
      client.emit('get:online')
      await closed
      expect(seen).toEqual(['session:revoked', 'disconnect'])
    })
  })

  describe('change-stream failures', () => {
    afterEach(() => { vi.restoreAllMocks() })

    /** A stand-in change stream the test drives by hand. */
    function fakeStream() {
      const stream = Object.assign(new EventEmitter(), { close: async () => { stream.emit('close') } })
      return stream
    }

    it('falls back to the sweep, without retrying, when the deployment has no change streams', async () => {
      const refusal = Object.assign(new Error('The $changeStream stage is only supported on replica sets'), { code: 40573 })
      const opened: EventEmitter[] = []
      const watch = vi.spyOn(User, 'watch').mockImplementation(() => {
        const stream = fakeStream()
        opened.push(stream)
        setImmediate(() => stream.emit('error', refusal))
        return stream as never
      })
      vi.spyOn(RevokedSession, 'watch').mockImplementation(() => {
        const stream = fakeStream()
        setImmediate(() => stream.emit('error', refusal))
        return stream as never
      })
      const realtime = await startRealtime({ revalidateIntervalMs: 200, packetRecheckMs: HOUR, watchRetryMs: 20 })
      try {
        await sleep(150)
        expect(watch).toHaveBeenCalledTimes(1)
        const userId = await account()
        const client = await realtime.open(token(userId))
        const revoked = nextEvent(client, 'session:revoked')
        await User.updateOne({ _id: userId }, { $inc: { sessionVersion: 1 } })
        await revoked
      } finally { await realtime.close() }
    })

    it('restarts a failed change stream and sweeps for what it missed once live again', async () => {
      const original = User.watch.bind(User)
      const first = fakeStream()
      const watch = vi.spyOn(User, 'watch').mockImplementationOnce(() => {
        setImmediate(() => first.emit('resumeTokenChanged'))
        return first as never
      }).mockImplementation((...args) => original(...args))
      const realtime = await startRealtime({ revalidateIntervalMs: HOUR, packetRecheckMs: HOUR, watchRetryMs: 50 })
      try {
        const userId = await account()
        const client = await realtime.open(token(userId))
        // Revoked while the (fake) stream delivers nothing: only the restart's sweep can notice.
        await User.updateOne({ _id: userId }, { $inc: { sessionVersion: 1 } })
        await sleep(150)
        expect(client.connected).toBe(true)
        const revoked = nextEvent(client, 'session:revoked')
        first.emit('error', new Error('connection reset'))
        await revoked
        expect(watch).toHaveBeenCalledTimes(2)
      } finally { await realtime.close() }
    })
  })
})

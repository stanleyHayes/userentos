import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { io as connect } from 'socket.io-client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { User } from '../models/User.js'
import { config } from '../config/index.js'
import { initSocket, realtimeChecksReady, shutdownRealtime } from '../services/socket.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'
import { nextEvent } from './sessionTestKit.js'

vi.mock('../models/Conversation.js', () => ({ Conversation: { find: () => ({ select: () => ({ lean: async () => [] }) }) } }))
vi.mock('../services/userBlocks.js', () => ({ blockedContacts: async () => new Set(), contactBlocked: async () => false }))

/*
 * Deploys send SIGTERM. A bare httpServer.close() never finishes while
 * upgraded WebSockets stay open, so shutdown used to hit the 10-second forced
 * exit (code 1) whenever anyone was connected.
 */
describe.skipIf(!hasTestMongo)('graceful realtime shutdown', () => {
  const userId = new mongoose.Types.ObjectId().toString()
  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await User.create({ _id: userId, email: `shutdown-${userId}@example.test`, phone: 'fixture', firstName: 'Shutdown', lastName: 'Fixture', passwordHash: 'fixture', roles: ['tenant'], activeRole: 'tenant' })
  })
  afterAll(async () => {
    await User.deleteMany({ _id: userId })
    await mongoose.disconnect()
  })

  it('disconnects connected clients, closes the HTTP server and stops the revocation watcher promptly', async () => {
    const original = User.watch.bind(User)
    const streams: { closed: boolean }[] = []
    vi.spyOn(User, 'watch').mockImplementation((...args) => {
      const stream = original(...args)
      streams.push(stream as unknown as { closed: boolean })
      return stream
    })
    const http = createServer()
    const server = initSocket(http)
    await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
    await realtimeChecksReady(server)
    const token = jwt.sign({ userId, purpose: 'session', sessionVersion: 0 }, config.jwtSecret, { expiresIn: 300 })
    const client = connect(`http://127.0.0.1:${(http.address() as AddressInfo).port}`, { auth: { token }, transports: ['websocket'], reconnection: false, autoConnect: false })
    const connected = nextEvent(client, 'connect')
    client.connect(); await connected
    const httpClosed = new Promise<void>(resolve => http.once('close', () => resolve()))
    const disconnected = nextEvent(client, 'disconnect')

    const started = Date.now()
    await shutdownRealtime(server, http)
    await Promise.all([httpClosed, disconnected])
    expect(Date.now() - started).toBeLessThan(1000)
    expect(http.listening).toBe(false)
    expect(client.connected).toBe(false)
    expect(streams.map(stream => stream.closed)).toEqual([true])
    vi.restoreAllMocks()
  })

  it('closes a server that never got as far as Socket.IO', async () => {
    const http = createServer()
    await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
    await shutdownRealtime(null, http)
    expect(http.listening).toBe(false)
  })
})

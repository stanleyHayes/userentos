import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { io as connect, type Socket as ClientSocket } from 'socket.io-client'
import type { Server } from 'socket.io'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { User } from '../models/User.js'
import { config } from '../config/index.js'
import { initSocket, disconnectBiometricUser, disconnectUser } from '../services/socket.js'
vi.mock('../models/Conversation.js', () => ({ Conversation: { find: () => ({ select: () => ({ lean: async () => [] }) }) } }))
vi.mock('../services/userBlocks.js', () => ({ blockedContacts: async () => new Set(), contactBlocked: async () => false }))
const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('live socket revocation', () => {
  const owners = [new mongoose.Types.ObjectId().toString(), new mongoose.Types.ObjectId().toString()]
  const clients: ClientSocket[] = []
  let http: HttpServer, server: Server, base: string
  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create(owners.map(id => ({ _id: id, email: `socket-${id}@example.test`, phone: 'fixture', firstName: 'Socket', lastName: 'Fixture', passwordHash: 'fixture', roles: ['tenant'], activeRole: 'tenant' })))
    http = createServer(); server = initSocket(http)
    await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    for (const client of clients) client.disconnect()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await User.deleteMany({ _id: { $in: owners } })
    await mongoose.disconnect()
  })
  function event(client: ClientSocket, name: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { client.off(name, done); reject(new Error(`Missing ${name}`)) }, 3000)
      function done(value: unknown) { clearTimeout(timer); resolve(value) }
      client.once(name, done)
    })
  }
  async function open(owner: string, biometricVersion?: number, sessionVersion = 0, rejected = false) {
    const token = jwt.sign({ userId: owner, purpose: 'session', sessionVersion, biometricVersion }, config.jwtSecret, { expiresIn: 300 })
    const client = connect(base, { auth: { token }, transports: ['websocket'], reconnection: false, autoConnect: false })
    clients.push(client)
    const ready = event(client, rejected ? 'connect_error' : 'connect')
    client.connect(); await ready
    return client
  }
  it('disconnects biometric sockets only, rejects reconnects, then supports account-wide revocation', async () => {
    const ordinary = await open(owners[0])
    const biometric = await open(owners[0], 0)
    const other = await open(owners[1], 0)
    const disconnected = event(biometric, 'disconnect')
    await User.updateOne({ _id: owners[0] }, { $inc: { biometricVersion: 1 } })
    disconnectBiometricUser(owners[0])
    await disconnected
    expect(biometric.connected).toBe(false)
    const ordinaryEvent = event(ordinary, 'fixture:probe')
    server.to(`user:${owners[0]}`).emit('fixture:probe', 'ordinary remains')
    expect(await ordinaryEvent).toBe('ordinary remains')
    const otherEvent = event(other, 'fixture:probe')
    server.to(`user:${owners[1]}`).emit('fixture:probe', 'other remains')
    expect(await otherEvent).toBe('other remains')
    expect((await open(owners[0], 0, 0, true)).connected).toBe(false)
    const current = await open(owners[0], 1)
    const ended = Promise.all([event(ordinary, 'disconnect'), event(current, 'disconnect')])
    await User.updateOne({ _id: owners[0] }, { $inc: { sessionVersion: 1 } })
    disconnectUser(owners[0])
    await ended
    expect((await open(owners[0], undefined, 0, true)).connected).toBe(false)
    expect(other.connected).toBe(true)
  })
  it.each([['account', 1], ['biometric', 1], ['account', 2], ['biometric', 2]] as const)('rejects a connection crossing %s revocation at auth check %s', async (kind, stage) => {
    const owner = owners[0]
    const user = await User.findById(owner)
    let release!: () => void
    let reached!: () => void
    const held = new Promise<void>(resolve => { reached = resolve })
    const resume = new Promise<void>(resolve => { release = resolve })
    const original = User.exists.bind(User)
    let checks = 0
    const spy = vi.spyOn(User, 'exists').mockImplementation(filter => (async () => {
      const result = await original(filter)
      if (++checks === stage) { reached(); await resume }
      return result
    })() as never)
    const token = jwt.sign({ userId: owner, purpose: 'session', sessionVersion: user?.sessionVersion ?? 0, biometricVersion: kind === 'biometric' ? user?.biometricVersion ?? 0 : undefined }, config.jwtSecret, { expiresIn: 300 })
    const client = connect(base, { auth: { token }, transports: ['websocket'], reconnection: false, autoConnect: false })
    clients.push(client)
    const closed = event(client, 'disconnect')
    client.connect()
    try {
      await held
      await User.updateOne({ _id: owner }, { $inc: kind === 'account' ? { sessionVersion: 1 } : { biometricVersion: 1 } })
      if (kind === 'account') disconnectUser(owner)
      else disconnectBiometricUser(owner)
      release()
      await closed
      expect(client.connected).toBe(false)
      expect(server.of('/').adapter.rooms.get(`user:${owner}`)?.size ?? 0).toBe(0)
    } finally { release(); spy.mockRestore() }
  })
  it('buffers an early client event until private admission completes', async () => {
    const user = await User.findById(owners[0])
    const client = await open(owners[0], undefined, user?.sessionVersion ?? 0)
    const response = event(client, 'online:list')
    client.emit('get:online')
    expect(await response).toEqual([])
  })

  it('disconnects an idle socket at token expiry and permits a fresh token to reconnect', async () => {
    const owner = owners[0]
    const user = await User.findById(owner)
    const token = jwt.sign({ userId: owner, purpose: 'session', sessionVersion: user?.sessionVersion ?? 0 }, config.jwtSecret, { expiresIn: 2 })
    const client = connect(base, { auth: { token }, transports: ['websocket'], reconnection: false, autoConnect: false })
    clients.push(client)
    const ready = event(client, 'connect')
    const closed = event(client, 'disconnect')
    const expired = event(client, 'session:expired')
    client.connect(); await ready
    const socketId = client.id!
    await expired
    await closed
    expect(client.connected).toBe(false)
    expect(server.of('/').adapter.rooms.get(`user:${owner}`)?.has(socketId) ?? false).toBe(false)
    const fresh = await open(owner, undefined, user?.sessionVersion ?? 0)
    const response = event(fresh, 'online:list')
    fresh.emit('get:online')
    expect(await response).toEqual([])
  })
  it('rejects session tokens that omit expiration', async () => {
    const user = await User.findById(owners[0])
    const token = jwt.sign({ userId: owners[0], purpose: 'session', sessionVersion: user?.sessionVersion ?? 0 }, config.jwtSecret)
    const client = connect(base, { auth: { token }, transports: ['websocket'], reconnection: false, autoConnect: false })
    clients.push(client)
    const rejected = event(client, 'connect_error')
    client.connect(); await rejected
    expect(client.connected).toBe(false)
  })

})

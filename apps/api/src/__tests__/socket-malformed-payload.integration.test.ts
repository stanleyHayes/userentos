import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { io as connect, type Socket as ClientSocket } from 'socket.io-client'
import type { Server } from 'socket.io'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { User } from '../models/User.js'
import { config } from '../config/index.js'
import { initSocket } from '../services/socket.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'
vi.mock('../models/Conversation.js', () => ({ Conversation: { find: () => ({ select: () => ({ lean: async () => [] }) }), findById: () => ({ select: () => ({ lean: async () => null }) }) } }))
vi.mock('../services/userBlocks.js', () => ({ blockedContacts: async () => new Set(), contactBlocked: async () => false }))
const uri = testMongoUri

// socket.io runs event listeners in process.nextTick with no try/catch, so a
// handler that throws on a malformed payload is an uncaughtException: it
// killed the whole API process for every user.
describe.skipIf(!hasTestMongo)('socket handlers survive malformed client payloads', () => {
  const owner = new mongoose.Types.ObjectId().toString()
  let http: HttpServer, server: Server, client: ClientSocket
  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create({ _id: owner, email: `malformed-${owner}@example.test`, phone: 'fixture', firstName: 'Socket', lastName: 'Fixture', passwordHash: 'fixture', roles: ['tenant'], activeRole: 'tenant' })
    http = createServer(); server = initSocket(http)
    await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
    const token = jwt.sign({ userId: owner, purpose: 'session', sessionVersion: 0 }, config.jwtSecret, { expiresIn: 300 })
    client = connect(`http://127.0.0.1:${(http.address() as AddressInfo).port}`, { auth: { token }, transports: ['websocket'], reconnection: false })
    await new Promise<void>((resolve, reject) => { client.once('connect', () => resolve()); client.once('connect_error', reject) })
  })
  afterAll(async () => {
    client?.disconnect()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await User.deleteMany({ _id: owner })
    await mongoose.disconnect()
  })

  it('ignores typing, join and leave events with missing or non-string ids', async () => {
    client.emit('typing:start')
    client.emit('typing:start', null)
    client.emit('typing:stop')
    client.emit('typing:stop', { conversationId: { $gt: '' } })
    client.emit('join:conversation', { $ne: null })
    client.emit('leave:conversation', null)
    // The server is still up and answering this socket.
    const online = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no online:list')), 3000)
      client.once('online:list', (list) => { clearTimeout(timer); resolve(list) })
      client.emit('get:online')
    })
    expect(online).toEqual([])
    expect(client.connected).toBe(true)
  })
})

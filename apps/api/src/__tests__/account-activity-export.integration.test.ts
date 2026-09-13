import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { Favorite } from '../models/Favorite.js'
import { Notification } from '../models/Notification.js'
import { Achievement } from '../models/Achievement.js'
import { PaymentStreak } from '../models/PaymentStreak.js'
import router from '../routes/users.js'
const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('account activity export', () => {
  const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()]
  const [owner, outsider] = ids.map(String)
  let server: Server
  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.collection.insertMany(ids.map(_id => ({ _id, email: `activity-${_id}@rentos.test`, roles: ['tenant'], passwordHash: 'private-password', mfaSecret: 'private-mfa', settings: { theme: 'dark', language: 'tw', notifications: { email: false, push: true } } })))
    await Promise.all([
      Favorite.create([owner, outsider].map(userId => ({ userId, propertyId: `property-${userId}` }))),
      Notification.create([owner, outsider].map(userId => ({ userId, title: 'Payment update', message: `message-${userId}`, channel: 'in_app', read: true }))),
      Achievement.create([owner, outsider].map(userId => ({ userId, code: 'fixture-award', title: 'Fixture award', description: 'Fixture milestone', icon: 'star', tier: 'bronze' as const, metadata: { milestone: 3 } }))),
      PaymentStreak.create([owner, outsider].map(userId => ({ userId, currentStreak: 2, longestStreak: 4, lastPaymentMonth: '2026-09', breaks: [{ brokenAt: new Date('2026-06-01'), previousStreak: 4, reason: 'Late payment' }] }))),
    ])
    const app = express(); app.use('/api/users', router)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    await Promise.all([
      Favorite.deleteMany({ userId: { $in: [owner, outsider] } }), Notification.deleteMany({ userId: { $in: [owner, outsider] } }),
      Achievement.deleteMany({ userId: { $in: [owner, outsider] } }), PaymentStreak.deleteMany({ userId: { $in: [owner, outsider] } }),
    ])
    await User.deleteMany({ _id: { $in: ids } })
    await mongoose.disconnect()
  })
  it('exports saved activity and preferences without another account or credentials', async () => {
    const token = jwt.sign({ userId: owner, roles: ['tenant'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '5m' })
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/users/me/export?userId=${outsider}`, { headers: { Authorization: `Bearer ${token}` } })
    expect(response.status).toBe(200)
    const { data } = await response.json()
    expect(data.user.settings).toMatchObject({ theme: 'dark', language: 'tw', notifications: { email: false, push: true } })
    expect(data.favorites).toHaveLength(1)
    expect(data.favorites[0].propertyId).toBe(`property-${owner}`)
    expect(data.notifications).toHaveLength(1)
    expect(data.notifications[0]).toMatchObject({ message: `message-${owner}`, read: true })
    expect(data.achievements).toHaveLength(1)
    expect(data.achievements[0]).toMatchObject({ code: 'fixture-award', metadata: { milestone: 3 } })
    expect(data.paymentStreak).toMatchObject({ currentStreak: 2, longestStreak: 4, breaks: [{ previousStreak: 4, reason: 'Late payment' }] })
    expect(JSON.stringify(data)).not.toContain(outsider)
    expect(JSON.stringify(data)).not.toMatch(/private-password|private-mfa/)
  })
})

import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../services/avatarStorage.js', () => ({ rememberLegacyAvatar: vi.fn(), uploadAvatar: vi.fn(), eraseAvatars: vi.fn() }))
vi.mock('../services/documentErasure.js', () => ({ erasePersonalDocuments: vi.fn() }))

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { Achievement } = await import('../models/Achievement.js')
const { PaymentStreak } = await import('../models/PaymentStreak.js')
const { default: usersRouter } = await import('../routes/users.js')
const { eraseAccountRecords } = await import('../services/accountErasure.js')

const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'

describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('account deletion keeps a minimal tombstone', () => {
  const userId = String(new mongoose.Types.ObjectId())
  let server: Server
  let base = ''

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create({
      _id: userId, email: `tomb-${userId}@rentos.test`, phone: '0240005001', firstName: 'Tom', lastName: 'Stone', passwordHash: 'fixture',
      roles: ['landlord'], activeRole: 'landlord', permissions: ['properties:create'], isVerified: true, verificationStatus: 'verified',
      taxReportingConsent: true, invitedBy: String(new mongoose.Types.ObjectId()), storeAccountToken: `tomb-token-${userId}`,
      suspendedAt: new Date(), suspensionReason: 'Fraud report', suspensionReportId: 'report-1',
      consents: { termsVersion: '2026-01', privacyVersion: '2026-01', acceptedAt: new Date('2026-01-02'), ageConfirmed: true, ip: '203.0.113.7', userAgent: 'TombstoneAgent/1.0' },
      settings: { theme: 'dark', language: 'tw', notifications: { email: false, sms: true, push: true, payment: true, savings: false } },
    })
    await Achievement.create({ userId, code: 'first_lease', title: 'First lease', description: 'x', icon: 'home', tier: 'bronze' })
    await PaymentStreak.create({ userId, currentStreak: 3, longestStreak: 3 })
    const app = express()
    app.use(express.json())
    app.use('/api/users', usersRouter)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Promise.all([User.deleteOne({ _id: userId, deletedAt: { $exists: true } }), User.deleteOne({ _id: userId }), Achievement.deleteMany({ userId }), PaymentStreak.deleteMany({ userId })])
    await mongoose.disconnect()
  })

  it('erases consent network evidence and preferences, keeping only fraud, billing and legal markers', async () => {
    // Suspended accounts may still delete their data.
    const token = jwt.sign({ userId, roles: ['landlord'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })
    const res = await fetch(`${base}/api/users/me`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)

    const tomb = await mongoose.connection.collection('users').findOne({ _id: new mongoose.Types.ObjectId(userId) })
    expect(tomb!.consents).toEqual({ termsVersion: '2026-01', privacyVersion: '2026-01', acceptedAt: new Date('2026-01-02'), ageConfirmed: true })
    for (const gone of ['settings', 'invitedBy', 'ghanaCardId', 'profileImage', 'mfaSecret']) expect(tomb).not.toHaveProperty(gone)
    expect(tomb).toMatchObject({ isVerified: false, verificationStatus: 'none', taxReportingConsent: false, permissions: [], firstName: 'Deleted', lastName: 'User' })
    expect(JSON.stringify(tomb)).not.toMatch(/203\.0\.113\.7|TombstoneAgent|tomb-.*@rentos\.test|0240005001/)
    // Retained on purpose: store notifications for refunds, and the suspension record.
    expect(tomb).toMatchObject({ storeAccountToken: `tomb-token-${userId}`, suspensionReason: 'Fraud report', suspensionReportId: 'report-1' })
    expect(tomb!.deletedAt).toBeInstanceOf(Date)
  })

  it('final erasure removes gamification records with no retention need', async () => {
    await User.updateOne({ _id: userId, deletedAt: { $exists: true } }, { $set: { deletedAt: new Date('2020-01-01') } })
    expect(await eraseAccountRecords(userId, new Date())).toBe(true)
    expect(await Achievement.countDocuments({ userId })).toBe(0)
    expect(await PaymentStreak.countDocuments({ userId })).toBe(0)
  })
})

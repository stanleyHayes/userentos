import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../services/notify.js', () => ({ notify: vi.fn().mockResolvedValue(true), notifyWelcome: vi.fn().mockResolvedValue(true) }))
vi.mock('../services/email.js', () => ({ sendInvitationEmail: vi.fn().mockResolvedValue(true), buildInviteUrl: (t: string) => `https://app.test/invite?token=${t}` }))

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { Wallet } = await import('../models/Wallet.js')
const { Invitation, hashInviteToken } = await import('../models/Invitation.js')
const { Achievement } = await import('../models/Achievement.js')
const { AuditLog } = await import('../models/AuditLog.js')
const { errorHandler } = await import('../middleware/errorHandler.js')
const { default: usersRouter } = await import('../routes/users.js')
const { default: invitationsRouter } = await import('../routes/invitations.js')
const { revokeUnreviewedVerification } = await import('../scripts/revokeUnreviewedVerification.js')
const { TERMS_VERSION, PRIVACY_VERSION } = await import('../types/index.js')

const uri = testMongoUri

describe.skipIf(!hasTestMongo)('identity verification comes only from an admin review', () => {
  const adminId = String(new mongoose.Types.ObjectId())
  const tag = adminId.slice(-8)
  const created: string[] = [adminId]
  let server: Server
  let base = ''
  const asAdmin = { Authorization: `Bearer ${jwt.sign({ userId: adminId, roles: ['super_admin'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`, 'Content-Type': 'application/json' }
  const call = async (path: string, headers: Record<string, string>, method = 'GET', body?: unknown) => {
    const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: response.status, data: (await response.json() as { data?: Record<string, unknown> }).data }
  }
  const badge = (userId: string) => Achievement.exists({ userId, code: 'profile_verified' })

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create({ _id: adminId, email: `verify-admin-${tag}@rentos.test`, phone: '0240009001', firstName: 'Ada', lastName: 'Admin', passwordHash: 'fixture', roles: ['super_admin'], activeRole: 'super_admin' })
    const app = express()
    app.use(express.json())
    app.use('/users', usersRouter)
    app.use('/invitations', invitationsRouter)
    app.use(errorHandler)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Promise.all([
      User.deleteMany({ _id: { $in: created } }),
      Wallet.deleteMany({ userId: { $in: created } }),
      Achievement.deleteMany({ userId: { $in: created } }),
      AuditLog.deleteMany({ $or: [{ userId: { $in: created } }, { entityId: { $in: created } }] }),
      Invitation.deleteMany({ email: new RegExp(`${tag}@rentos\\.test$`) }),
    ])
    await mongoose.disconnect()
  })

  it('does not verify an invited account on acceptance', async () => {
    const token = crypto.randomBytes(32).toString('hex')
    await Invitation.create({ email: `invitee-${tag}@rentos.test`, roles: ['landlord'], permissions: [], invitedBy: adminId, token: hashInviteToken(token), expiresAt: new Date(Date.now() + 60_000) })
    const accepted = await call('/invitations/accept', { 'Content-Type': 'application/json' }, 'POST', {
      token, firstName: 'Ivy', lastName: 'Invitee', phone: '0240009002', password: 'Str0ng!Pass',
      acceptance: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, ageConfirmed: true },
    })
    expect(accepted.status).toBe(201)
    const id = String(accepted.data!.id)
    created.push(id)
    expect(accepted.data).toMatchObject({ isVerified: false, verificationStatus: 'none' })
    expect(await badge(id)).toBeNull()
  })

  it('does not verify an account an administrator creates', async () => {
    const res = await call('/users', asAdmin, 'POST', { email: `made-${tag}@rentos.test`, phone: '0240009003', password: 'Str0ng!Pass', firstName: 'Max', lastName: 'Made', roles: ['landlord'] })
    expect(res.status).toBe(201)
    const id = String(res.data!.id)
    created.push(id)
    expect(res.data).toMatchObject({ isVerified: false, verificationStatus: 'none' })
    expect(await badge(id)).toBeNull()
  })

  it('verifies and awards the badge when an administrator approves the review', async () => {
    const user = await User.create({ email: `reviewed-${tag}@rentos.test`, phone: '0240009004', firstName: 'Rae', lastName: 'Reviewed', passwordHash: 'fixture', roles: ['tenant'], activeRole: 'tenant', ghanaCardId: 'GHA-222333444-5', verificationStatus: 'pending' })
    created.push(user.id)
    expect((await call(`/users/${user.id}/verify-identity`, asAdmin, 'POST', {})).status).toBe(200)
    expect(await User.findById(user.id).lean()).toMatchObject({ isVerified: true, verificationStatus: 'verified' })
    expect(await badge(user.id)).not.toBeNull()
  })

  it('backfill withdraws verification and the badge from accounts that were never reviewed', async () => {
    const [legacy, reviewed] = await User.create([
      { email: `legacy-${tag}@rentos.test`, phone: '0240009005', firstName: 'Leo', lastName: 'Legacy', passwordHash: 'fixture', roles: ['landlord'], activeRole: 'landlord', isVerified: true, invitedBy: adminId },
      { email: `kept-${tag}@rentos.test`, phone: '0240009006', firstName: 'Kim', lastName: 'Kept', passwordHash: 'fixture', roles: ['tenant'], activeRole: 'tenant', isVerified: true, verificationStatus: 'verified' },
    ])
    created.push(legacy.id, reviewed.id)
    await Achievement.create([legacy.id, reviewed.id].map((userId) => ({ userId, code: 'profile_verified', title: 'Verified Member', description: 'Identity verified on RentOS.', icon: 'shield-check', tier: 'silver' as const })))

    expect(await revokeUnreviewedVerification({ userIds: [legacy.id, reviewed.id] })).toEqual({ users: 1, badges: 1 })
    expect((await User.findById(legacy.id).lean())?.isVerified).toBe(false)
    expect(await badge(legacy.id)).toBeNull()
    expect((await User.findById(reviewed.id).lean())?.isVerified).toBe(true)
    expect(await badge(reviewed.id)).not.toBeNull()
    expect(await revokeUnreviewedVerification({ userIds: [legacy.id, reviewed.id] })).toEqual({ users: 0, badges: 0 })
  })
})

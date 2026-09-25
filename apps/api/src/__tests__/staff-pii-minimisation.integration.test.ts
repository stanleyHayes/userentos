import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../services/notify.js', () => ({ notify: vi.fn().mockResolvedValue(true), notifyWelcome: vi.fn() }))
vi.mock('../services/webhooks.js', () => ({ dispatchWebhook: vi.fn() }))

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { Agreement } = await import('../models/Agreement.js')
const { AuditLog } = await import('../models/AuditLog.js')
const { errorHandler } = await import('../middleware/errorHandler.js')
const { default: usersRouter } = await import('../routes/users.js')
const { default: agreementsRouter } = await import('../routes/agreements.js')

const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'

describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('staff views minimise national IDs and contact details (Act 843)', () => {
  const ids = { subject: '', gov: '', admin: '', landlord: '' }
  for (const key of Object.keys(ids) as (keyof typeof ids)[]) ids[key] = String(new mongoose.Types.ObjectId())
  const tag = ids.subject.slice(-8)
  const email = `pii-subject-${tag}@rentos.test`
  let server: Server
  let base = ''
  const as = (userId: string, roles: string[]) => ({ Authorization: `Bearer ${jwt.sign({ userId, roles, permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`, 'Content-Type': 'application/json' })
  const asGov = as(ids.gov, ['government'])
  const asAdmin = as(ids.admin, ['admin'])
  const call = async (path: string, headers: Record<string, string>, method = 'GET', body?: unknown) => {
    const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: response.status, data: (await response.json() as { data?: Record<string, unknown> }).data }
  }

  beforeAll(async () => {
    await mongoose.connect(uri)
    const user = (id: string, role: string, extra: Record<string, unknown> = {}) => ({ _id: id, email: `pii-${role}-${id}@rentos.test`, phone: '0240001234', firstName: `Pii${tag}`, lastName: role, passwordHash: 'fixture', roles: [role], activeRole: role, ...extra })
    await User.create([
      user(ids.subject, 'tenant', { email, ghanaCardId: 'GHA-123456789-0', verificationStatus: 'pending', consents: { termsVersion: '1', privacyVersion: '1', acceptedAt: new Date(), ageConfirmed: true, ip: '203.0.113.9', userAgent: 'FixtureAgent' } }),
      user(ids.gov, 'government'),
      user(ids.admin, 'admin'),
      user(ids.landlord, 'landlord'),
    ])
    await Agreement.create({ propertyId: `pii-prop-${tag}`, landlordId: ids.landlord, tenantId: ids.subject, status: 'active', startDate: '2026-01-01', endDate: '2027-01-01', rentAmount: 900, tenantSignature: '2026-01-01T00:00:00.000Z', landlordSignature: '2026-01-01T00:00:00.000Z' })
    const app = express()
    app.use(express.json())
    app.use('/users', usersRouter)
    app.use('/agreements', agreementsRouter)
    app.use(errorHandler)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Promise.all([
      User.deleteMany({ _id: { $in: Object.values(ids) } }),
      Agreement.deleteMany({ tenantId: ids.subject }),
      AuditLog.deleteMany({ entityId: ids.subject }),
    ])
    await mongoose.disconnect()
  })

  it('gives government a directory of names and roles, never contact details, IDs or consent evidence', async () => {
    const list = await call(`/users?search=Pii${tag}&pageSize=100`, asGov)
    expect(list.status).toBe(200)
    const subject = (list.data!.items as Record<string, unknown>[]).find((u) => u.id === ids.subject)!
    expect(subject).toMatchObject({ firstName: `Pii${tag}`, roles: ['tenant'], isVerified: false })
    for (const hidden of ['email', 'phone', 'ghanaCardId', 'consents', 'settings', 'permissions']) expect(subject).not.toHaveProperty(hidden)
    // Email search would confirm whose account an address belongs to.
    expect((await call(`/users?search=${encodeURIComponent(email)}`, asGov)).data!.total).toBe(0)

    const detail = await call(`/users/${ids.subject}`, asGov)
    expect(detail.data).not.toHaveProperty('email')
    expect(detail.data).not.toHaveProperty('phone')
  })

  it('gives administrators contact details but no national ID or consent evidence in the directory', async () => {
    const list = await call(`/users?search=${encodeURIComponent(email)}`, asAdmin)
    const [subject] = list.data!.items as Record<string, unknown>[]
    expect(subject).toMatchObject({ id: ids.subject, email, phone: '0240001234' })
    expect(subject).not.toHaveProperty('ghanaCardId')
    expect(subject).not.toHaveProperty('consents')
    expect(JSON.stringify(list.data)).not.toContain('123456789')
  })

  it('keeps identity review with administrators, showing only the last four characters', async () => {
    expect((await call('/users/verification-requests', asGov)).status).toBe(403)
    expect((await call(`/users/${ids.subject}/verify-identity`, asGov, 'POST', {})).status).toBe(403)
    const queue = await call('/users/verification-requests', asAdmin)
    const entry = (queue.data!.items as Record<string, unknown>[]).find((u) => u.id === ids.subject)!
    expect(entry.ghanaCardLast4).toBe('7890')
    expect(entry).not.toHaveProperty('ghanaCardId')
    expect(entry).not.toHaveProperty('email')
    expect(JSON.stringify(queue.data)).not.toContain('123456789')
  })

  it('discloses the full number only to an administrator who gives a reason, and audits it', async () => {
    expect((await call(`/users/${ids.subject}/ghana-card/reveal`, asGov, 'POST', { reason: 'curious' })).status).toBe(403)
    expect((await call(`/users/${ids.subject}/ghana-card/reveal`, asAdmin, 'POST', {})).status).toBe(400)
    const revealed = await call(`/users/${ids.subject}/ghana-card/reveal`, asAdmin, 'POST', { reason: 'Compare with the card photo for verification' })
    expect(revealed.status).toBe(200)
    expect(revealed.data!.ghanaCardId).toBe('GHA-123456789-0')
    const audit = await AuditLog.findOne({ action: 'users.ghana_card.reveal', entityId: ids.subject }).lean()
    expect(audit).toMatchObject({ userId: ids.admin })
    expect(JSON.parse(audit!.details!)).toEqual({ reason: 'Compare with the card photo for verification' })
  })

  it('shows regulators every agreement but not the tenant contact details on it', async () => {
    const govList = await call('/agreements?pageSize=100', asGov)
    const item = (govList.data!.items as Record<string, unknown>[]).find((a) => a.tenantId === ids.subject)!
    expect(item.tenantName).toBeDefined()
    expect(item.tenantEmail).toBeUndefined()
    expect(item.tenantPhone).toBeUndefined()
    const landlordList = await call('/agreements', as(ids.landlord, ['landlord']))
    expect((landlordList.data!.items as Record<string, unknown>[])[0]).toMatchObject({ tenantEmail: email, tenantPhone: '0240001234' })
  })
})

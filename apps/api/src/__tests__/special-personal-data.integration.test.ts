import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { TenantProfile } = await import('../models/TenantProfile.js')
const { default: usersRouter } = await import('../routes/users.js')
const { default: tenantProfileRouter } = await import('../routes/tenantProfile.js')
const { removeSpecialCategoryProfileFields } = await import('../scripts/removeSpecialCategoryProfileFields.js')

const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'

describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('religion and ethnicity are not collected or returned (Act 843 s.37)', () => {
  const tenantId = String(new mongoose.Types.ObjectId())
  const otherId = String(new mongoose.Types.ObjectId())
  let server: Server
  let base = ''
  const asTenant = { Authorization: `Bearer ${jwt.sign({ userId: tenantId, roles: ['tenant'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`, 'Content-Type': 'application/json' }
  const call = async (path: string, method = 'GET', body?: unknown) => {
    const response = await fetch(`${base}${path}`, { method, headers: asTenant, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: response.status, data: (await response.json() as { data?: Record<string, unknown> }).data }
  }

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create({ _id: tenantId, email: `special-${tenantId}@rentos.test`, phone: '0240006001', firstName: 'Spe', lastName: 'Cial', passwordHash: 'fixture', roles: ['tenant'], activeRole: 'tenant' })
    // Rows written before the fields were removed.
    await mongoose.connection.collection('tenantprofiles').insertMany([
      { userId: tenantId, religion: 'christian', ethnicGroup: 'Akan', hometown: 'Kumasi', languagesSpoken: [] },
      { userId: otherId, religion: 'muslim', languagesSpoken: [] },
    ])
    const app = express()
    app.use(express.json())
    app.use('/users', usersRouter)
    app.use('/tenant-profile', tenantProfileRouter)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Promise.all([User.deleteOne({ _id: tenantId }), TenantProfile.deleteMany({ userId: { $in: [tenantId, otherId] } })])
    await mongoose.disconnect()
  })

  it('never returns legacy values, even to the owner or in their export', async () => {
    const own = await call('/tenant-profile/me')
    expect(own.data).toMatchObject({ hometown: 'Kumasi' })
    expect(own.data).not.toHaveProperty('religion')
    expect(own.data).not.toHaveProperty('ethnicGroup')
    const exported = await call('/users/me/export')
    expect(exported.data!.tenantProfile).not.toHaveProperty('religion')
    expect(exported.data!.tenantProfile).not.toHaveProperty('ethnicGroup')
  })

  it('rejects attempts to store them', async () => {
    expect((await call('/tenant-profile/me', 'PATCH', { religion: 'christian' })).status).toBe(400)
    expect((await call('/tenant-profile/me', 'PATCH', { ethnicGroup: 'Akan' })).status).toBe(400)
  })

  it('the cleanup removes stored values and is safe to re-run', async () => {
    expect(await removeSpecialCategoryProfileFields({ userIds: [tenantId, otherId] })).toBe(2)
    const rows = await mongoose.connection.collection('tenantprofiles').find({ userId: { $in: [tenantId, otherId] } }).toArray()
    expect(rows.every((row) => !('religion' in row) && !('ethnicGroup' in row))).toBe(true)
    expect(rows.find((row) => row.userId === tenantId)?.hometown).toBe('Kumasi')
    expect(await removeSpecialCategoryProfileFields({ userIds: [tenantId, otherId] })).toBe(0)
  })
})

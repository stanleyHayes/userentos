import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { TenantProfile } = await import('../models/TenantProfile.js')
const { default: tenantProfileRouter } = await import('../routes/tenantProfile.js')

/*
 * The mobile "Verify Identity" item opened the tenant profile for every
 * account, and reading it created an empty TenantProfile for agents and
 * landlords too. Only tenant accounts get one now.
 */
describe.skipIf(!hasTestMongo)('GET /tenant-profile/me creates a profile only for tenants', () => {
  const ids = { tenant: '', agent: '', agentWithProfile: '' }
  for (const key of Object.keys(ids) as (keyof typeof ids)[]) ids[key] = String(new mongoose.Types.ObjectId())
  let server: Server
  let base = ''
  const get = (userId: string, roles: string[]) => fetch(`${base}/tenant-profile/me`, {
    headers: { Authorization: `Bearer ${jwt.sign({ userId, roles, permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}` },
  })

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await User.create(([['tenant', 'tenant'], ['agent', 'property_manager'], ['agentWithProfile', 'property_manager']] as const).map(([key, role], i) => ({
      _id: ids[key], email: `tp-roles-${ids[key]}@rentos.test`, phone: `02400071${10 + i}`, firstName: 'Profile', lastName: key, passwordHash: 'fixture', roles: [role], activeRole: role,
    })))
    // Created before the change, when any account that opened the screen got one.
    await TenantProfile.create({ userId: ids.agentWithProfile, bio: 'Kept as it was' })
    const app = express()
    app.use(express.json())
    app.use('/tenant-profile', tenantProfileRouter)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Promise.all([TenantProfile.deleteMany({ userId: { $in: Object.values(ids) } }), User.deleteMany({ _id: { $in: Object.values(ids) } })])
    await mongoose.disconnect()
  })

  it('answers an agent with no profile 404 and creates nothing', async () => {
    const res = await get(ids.agent, ['property_manager'])
    expect(res.status).toBe(404)
    expect(await TenantProfile.countDocuments({ userId: ids.agent })).toBe(0)
  })

  it('still creates one for a tenant, and returns one that already exists', async () => {
    expect((await get(ids.tenant, ['tenant'])).status).toBe(200)
    expect(await TenantProfile.countDocuments({ userId: ids.tenant })).toBe(1)
    const existing = await get(ids.agentWithProfile, ['property_manager'])
    expect(existing.status).toBe(200)
    expect((await existing.json() as { data: { bio?: string } }).data.bio).toBe('Kept as it was')
  })
})

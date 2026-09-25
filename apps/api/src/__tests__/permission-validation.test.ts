import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { User } from '../models/User.js'
import { config } from '../config/index.js'

const base = { email: 'perm@rentos.test', phone: '0240004001', firstName: 'Per', lastName: 'Mission', passwordHash: 'fixture', roles: ['admin'], activeRole: 'admin' }
const permissionError = async (doc: mongoose.Document) => (await doc.validate().then(() => null, (err: mongoose.Error.ValidationError) => err))?.errors.permissions

describe('User.permissions accepts only known permissions on write', () => {
  it('rejects an unknown permission on a new account', async () => {
    expect(await permissionError(new User({ ...base, permissions: ['users:view', 'users:godmode'] }))).toBeDefined()
    expect(await permissionError(new User({ ...base, permissions: ['users:view'] }))).toBeUndefined()
  })

  it('lets a legacy account holding a retired permission save unrelated changes', async () => {
    const legacy = User.hydrate({ _id: new mongoose.Types.ObjectId(), ...base, permissions: ['reports:legacy', 'users:view'] })
    legacy.firstName = 'Renamed'
    expect(await permissionError(legacy)).toBeUndefined()
  })

  it('validates the list again once it is rewritten', async () => {
    const legacy = User.hydrate({ _id: new mongoose.Types.ObjectId(), ...base, permissions: ['reports:legacy'] })
    legacy.permissions = ['reports:legacy', 'users:view']
    expect(await permissionError(legacy)).toBeDefined()
  })
})

const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('PATCH /users/:id/permissions with legacy permission strings', () => {
  const targetId = String(new mongoose.Types.ObjectId())
  let server: Server
  let url = ''
  const superId = String(new mongoose.Types.ObjectId())
  const asSuper = { Authorization: `Bearer ${jwt.sign({ userId: superId, roles: ['super_admin'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`, 'Content-Type': 'application/json' }
  const patch = (permissions: unknown) => fetch(url, { method: 'PATCH', headers: asSuper, body: JSON.stringify({ permissions }) })

  beforeAll(async () => {
    await mongoose.connect(uri)
    await mongoose.connection.collection('users').insertMany([
      { _id: new mongoose.Types.ObjectId(targetId), ...base, email: `perm-${targetId}@rentos.test`, permissions: ['reports:legacy', 'users:view'] },
      { _id: new mongoose.Types.ObjectId(superId), ...base, email: `perm-super-${superId}@rentos.test`, roles: ['super_admin'], activeRole: 'super_admin', permissions: [] },
    ])
    const { default: usersRouter } = await import('../routes/users.js')
    const { errorHandler } = await import('../middleware/errorHandler.js')
    const app = express()
    app.use(express.json())
    app.use('/users', usersRouter)
    app.use(errorHandler)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/users/${targetId}/permissions`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await User.deleteMany({ _id: { $in: [targetId, superId] } })
    await mongoose.disconnect()
  })

  it('refuses a permission nobody holds or defines', async () => {
    const res = await patch(['users:view', 'users:godmode'])
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('users:godmode')
  })

  it('drops a retired permission the editor sends back unchanged, instead of failing', async () => {
    const res = await patch(['reports:legacy', 'users:view', 'users:edit'])
    expect(res.status).toBe(200)
    expect((await User.findById(targetId).lean())?.permissions).toEqual(['users:view', 'users:edit'])
  })
})

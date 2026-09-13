import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import router from '../routes/settings.js'
const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('settings persistence', () => {
  const id = new mongoose.Types.ObjectId()
  let server: Server, url: string
  const token = jwt.sign({ userId: String(id), roles: ['tenant'], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const defaults = { theme: 'system', language: 'en', notifications: { email: true, sms: true, push: true, payment: true, savings: true } }
  const patch = (body: unknown) => fetch(url, { method: 'PATCH', headers, body: JSON.stringify(body) })
  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create({ _id: id, email: `settings-${id}@rentos.test`, phone: '0241234567', firstName: 'Settings', lastName: 'Fixture', passwordHash: 'fixture-only', roles: ['tenant'], activeRole: 'tenant' })
    const app = express(); app.use(express.json()); app.use('/settings', router)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/settings`
  })
  beforeEach(async () => { await User.updateOne({ _id: id }, { $set: { settings: defaults } }) })
  afterEach(() => vi.restoreAllMocks())
  afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); await User.deleteOne({ _id: id }); await mongoose.disconnect() })
  it.each([{ notifications: { email: 'false' } }, { notifications: { push: 0 } }, { notifications: [] }, { notifications: { unknown: false } }, { theme: 'invalid' }, { language: { code: 'en' } }, { language: 'unsupported' }, { userId: 'someone-else' }])('rejects malformed settings without changing stored preferences: %j', async body => {
    expect((await patch(body)).status).toBe(400)
    expect((await User.findById(id).lean())?.settings).toMatchObject(defaults)
  })
  it('preserves independent notification changes when requests overlap', async () => {
    const originalSave = User.prototype.save
    let entered = 0
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    vi.spyOn(User.prototype, 'save').mockImplementation(async function (this: InstanceType<typeof User>) {
      if (++entered === 2) release()
      await gate
      return originalSave.call(this)
    })
    const results = await Promise.all([patch({ notifications: { email: false } }), patch({ notifications: { push: false } })])
    expect(results.map(response => response.status)).toEqual([200, 200])
    const saved = (await User.findById(id).lean())?.settings
    expect(saved?.notifications).toMatchObject({ email: false, push: false, sms: true, payment: true, savings: true })
  })
  it('returns the same accepted preferences on update and subsequent retrieval', async () => {
    const response = await patch({ theme: 'dark', language: 'tw', notifications: { email: false } })
    expect(response.status).toBe(200)
    const result = await response.json()
    const read = await (await fetch(url, { headers })).json()
    expect(read.data).toEqual(result.data)
    expect(read.data).toMatchObject({ theme: 'dark', language: 'tw', notifications: { email: false, push: true } })
  })
})

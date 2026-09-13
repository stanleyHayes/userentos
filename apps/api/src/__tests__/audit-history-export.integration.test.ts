import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { AuditLog } from '../models/AuditLog.js'
import router from '../routes/users.js'
const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('complete audit history export', () => {
  const owner = String(new mongoose.Types.ObjectId()), outsider = String(new mongoose.Types.ObjectId())
  let server: Server
  beforeAll(async () => {
    await mongoose.connect(uri)
    vi.spyOn(User, 'exists').mockResolvedValue({ _id: new mongoose.Types.ObjectId(owner) })
    await AuditLog.insertMany([
      ...Array.from({ length: 1005 }, (_, index) => ({ userId: owner, action: 'view', entityType: 'property', entityId: `owned-${index}`, createdAt: new Date(1700000000000 + index) })),
      { userId: outsider, action: 'view', entityType: 'property', entityId: 'OTHER-AUDIT' },
    ])
    const app = express(); app.use('/api/users', router)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  })
  afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); vi.restoreAllMocks(); await AuditLog.deleteMany({ userId: { $in: [owner, outsider] } }); await mongoose.disconnect() })
  it('exports the complete owned history beyond 1000 rows without cross-account records', async () => {
    const token = jwt.sign({ userId: owner, roles: ['tenant'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '5m' })
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/users/me/export?userId=${outsider}`, { headers: { Authorization: `Bearer ${token}` } })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json()
    expect(body.data.auditLogs).toHaveLength(1005)
    expect(body.data.auditLogs[0].entityId).toBe('owned-1004')
    expect(body.data.auditLogs.at(-1).entityId).toBe('owned-0')
    expect(new Set(body.data.auditLogs.map((row: { entityId: string }) => row.entityId)).size).toBe(1005)
    expect(JSON.stringify(body.data.auditLogs)).not.toContain('OTHER-AUDIT')
  })
})

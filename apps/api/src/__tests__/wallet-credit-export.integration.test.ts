import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { WalletCredit } from '../models/WalletCredit.js'
import router from '../routes/users.js'
const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('wallet credit personal export', () => {
  const owner = String(new mongoose.Types.ObjectId()), outsider = String(new mongoose.Types.ObjectId())
  let server: Server
  beforeAll(async () => {
    await mongoose.connect(uri)
    vi.spyOn(User, 'exists').mockResolvedValue({ _id: new mongoose.Types.ObjectId(owner) })
    await WalletCredit.create([
      { operationKey: `export:${owner}`, userId: owner, amount: 100, type: 'deposit', reference: 'OWN-CREDIT', state: 'completed' },
      { operationKey: `export:${outsider}`, userId: outsider, amount: 200, type: 'deposit', reference: 'OTHER-CREDIT', state: 'pending' },
    ])
    const app = express(); app.use('/api/users', router)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  })
  afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); vi.restoreAllMocks(); await WalletCredit.deleteMany({ userId: { $in: [owner, outsider] } }); await mongoose.disconnect() })
  it('exports only the authenticated beneficiary journal, ignoring query impersonation', async () => {
    const token = jwt.sign({ userId: owner, roles: ['tenant'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '5m' })
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/users/me/export?userId=${outsider}`, { headers: { Authorization: `Bearer ${token}` } })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json()
    expect(body.data.walletCredits).toHaveLength(1)
    expect(body.data.walletCredits[0]).toMatchObject({ reference: 'OWN-CREDIT', amount: 100, state: 'completed' })
    expect(JSON.stringify(body.data.walletCredits)).not.toContain('OTHER-CREDIT')
  })
})

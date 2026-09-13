import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { Investment } from '../models/Investment.js'
import { InsurancePolicy } from '../models/InsurancePolicy.js'
import router from '../routes/users.js'
const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('personal investment and insurance export', () => {
  const owner = String(new mongoose.Types.ObjectId()), outsider = String(new mongoose.Types.ObjectId())
  let server: Server
  beforeAll(async () => {
    await mongoose.connect(uri)
    vi.spyOn(User, 'exists').mockResolvedValue({ _id: new mongoose.Types.ObjectId(owner) })
    await Promise.all([
      Investment.create([owner, outsider].map(userId => ({ userId, type: 'treasury_bill' as const, amount: 1000, interestRate: 10, tenure: 91, startDate: '2026-06-01', maturityDate: '2026-08-31', status: 'matured' as const, expectedReturn: 1025, actualReturn: 1024, partnerId: owner }))),
      InsurancePolicy.create([owner, outsider].map(userId => ({ userId, productId: 'fixture-product', propertyId: owner, startDate: '2026-01-01', endDate: '2026-12-31', monthlyPremium: 25, status: 'active' as const, policyNumber: `EXPORT-${userId}`, claims: [{ id: `claim-${userId}`, filedAt: '2026-07-01', amount: 100, status: 'paid' as const, description: 'Fixture damage', payoutAmount: 80, decidedAt: '2026-07-15' }] }))),
    ])
    const app = express(); app.use('/api/users', router)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    vi.restoreAllMocks()
    await Promise.all([Investment.deleteMany({ userId: { $in: [owner, outsider] } }), InsurancePolicy.deleteMany({ userId: { $in: [owner, outsider] } })])
    await mongoose.disconnect()
  })
  it.each([['tenant'], ['admin', 'super_admin']])('exports personal investments and policy claims without portfolio privileges (%j)', async (...roles) => {
    const token = jwt.sign({ userId: owner, roles, permissions: ['insurance:review_claims'], purpose: 'session' }, config.jwtSecret, { expiresIn: '5m' })
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/users/me/export?applicantId=${outsider}&userId=${outsider}`, { headers: { Authorization: `Bearer ${token}` } })
    expect(response.status).toBe(200)
    const { data } = await response.json()
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(data.investments).toHaveLength(1)
    expect(data.investments[0]).toMatchObject({ userId: owner, amount: 1000, expectedReturn: 1025, actualReturn: 1024, maturityDate: '2026-08-31' })
    expect(data.insurancePolicies).toHaveLength(1)
    expect(data.insurancePolicies[0]).toMatchObject({ userId: owner, monthlyPremium: 25, policyNumber: `EXPORT-${owner}`, claims: [{ id: `claim-${owner}`, status: 'paid', amount: 100, payoutAmount: 80 }] })
    expect(JSON.stringify([data.investments, data.insurancePolicies])).not.toContain(outsider)
  })
})

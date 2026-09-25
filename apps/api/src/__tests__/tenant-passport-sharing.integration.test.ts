import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { config } from '../config/index.js'
import { reloadRegulatedFeatures } from '../config/regulatedFeatures.js'
import { User } from '../models/User.js'
import { CreditScore } from '../models/CreditScore.js'
import { Payment } from '../models/Payment.js'
import router from '../routes/tenantPassport.js'

const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('tenant passport sharing', () => {
  const _id = new mongoose.Types.ObjectId()
  const tenantId = String(_id)
  const email = `passport-${tenantId}@rentos.test`
  let server: Server
  const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/tenant-passport`
  const auth = { Authorization: `Bearer ${jwt.sign({ userId: tenantId, roles: ['tenant'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '5m' })}` }

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.collection.insertOne({ _id, email, firstName: 'Ama', lastName: 'Passport', roles: ['tenant'], activeRole: 'tenant', passwordHash: 'x', isVerified: true })
    await CreditScore.collection.insertOne({ userId: tenantId, score: 81, factors: { paymentHistory: 30 }, calculatedAt: new Date() })
    await Payment.collection.insertMany([
      { tenantId, amount: 1500, status: 'completed', purpose: 'rent', reference: `PP-${tenantId}-1`, createdAt: new Date() },
      { tenantId, amount: 1500, status: 'failed', purpose: 'rent', reference: `PP-${tenantId}-2`, createdAt: new Date() },
    ])
    const app = express(); app.use(express.json()); app.use('/api/tenant-passport', router)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  })
  afterEach(() => reloadRegulatedFeatures(process.env))
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    await Promise.all([Payment.deleteMany({ tenantId }), CreditScore.deleteMany({ userId: tenantId }), User.deleteMany({ _id })])
    await mongoose.disconnect()
  })

  it('gives the tenant their full record but a shared link only the summary', async () => {
    const own = await (await fetch(`${base()}/me/json`, { headers: auth })).json()
    expect(own.data.user.email).toBe(email)
    expect(own.data.payments).toMatchObject({ total: 2, completed: 1, lifetimeTotalGhs: 1500, onTimePct: 50 })
    expect(own.data.creditScore.score).toBe(81)

    const { data: link } = await (await fetch(`${base()}/share`, { method: 'POST', headers: auth })).json()
    const response = await fetch(`${base()}/shared/${link.token}/json`)
    expect(response.status).toBe(200)
    const { data } = await response.json()
    expect(data.user).toMatchObject({ firstName: 'Ama', lastName: 'Passport', isVerified: true })
    expect(data.payments).toMatchObject({ total: 2, completed: 1, lifetimeTotalGhs: null })
    expect(JSON.stringify(data)).not.toContain(email)
  })

  it('omits the credit score everywhere when credit reporting is not offered', async () => {
    reloadRegulatedFeatures({ NODE_ENV: 'production' })
    const own = await (await fetch(`${base()}/me/json`, { headers: auth })).json()
    expect(own.data).toMatchObject({ creditScoreOffered: false, creditScore: null })
    const { data: link } = await (await fetch(`${base()}/share`, { method: 'POST', headers: auth })).json()
    const shared = await (await fetch(`${base()}/shared/${link.token}/json`)).json()
    expect(shared.data).toMatchObject({ creditScoreOffered: false, creditScore: null })
    const pdf = await fetch(`${base()}/shared/${link.token}/pdf`)
    expect(pdf.status).toBe(200)
    expect(pdf.headers.get('content-type')).toContain('application/pdf')
  })
})

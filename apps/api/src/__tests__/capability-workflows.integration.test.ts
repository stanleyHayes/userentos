import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { Wallet } from '../models/Wallet.js'
import { Business } from '../models/Business.js'
import { Payment } from '../models/Payment.js'
import { CapabilityRecord } from '../models/CapabilityRecord.js'
import { creditWallet } from '../services/payments/walletLedger.js'
import router from '../routes/capabilities.js'

const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('capability workflows', () => {
  const business = new mongoose.Types.ObjectId(), developer = new mongoose.Types.ObjectId()
  const admin = new mongoose.Types.ObjectId(), government = new mongoose.Types.ObjectId()
  const ids = [business, developer, admin, government]
  const failedRef = `CAP-FAILED-${business}`
  let server: Server, url: string
  const headers = (id: mongoose.Types.ObjectId, roles: string[]) => ({
    Authorization: `Bearer ${jwt.sign({ userId: String(id), roles, permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`,
    'Content-Type': 'application/json',
  })
  const post = (as: mongoose.Types.ObjectId, roles: string[], path: string, body: unknown) =>
    fetch(`${url}${path}`, { method: 'POST', headers: headers(as, roles), body: JSON.stringify(body) })

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create(ids.map((_id, i) => ({
      _id, email: `cap-${i}-${_id}@rentos.test`, phone: '0241234567', firstName: 'Cap', lastName: 'Fixture',
      passwordHash: 'fixture-only', roles: [['business', 'developer', 'admin', 'government'][i]], activeRole: ['business', 'developer', 'admin', 'government'][i],
    })))
    await Business.create({ ownerId: String(business), name: 'Fixture Movers', category: Business.schema.path('category').options.enum[0], phone: '0241234567', city: 'Accra' })
    await creditWallet(String(business), 100, { type: 'deposit', reference: `CAP-SEED-${business}`, description: 'fixture' })
    await Payment.create({ tenantId: String(business), landlordId: String(developer), purpose: 'rent', amount: 42, method: 'mtn_momo', reference: failedRef, status: 'failed' })
    const app = express(); app.use(express.json()); app.use('/cap', router)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/cap`
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    await CapabilityRecord.deleteMany({ ownerId: { $in: ids.map(String) } })
    await Payment.deleteOne({ reference: failedRef })
    await Business.deleteMany({ ownerId: String(business) })
    await Wallet.deleteMany({ userId: String(business) })
    await User.deleteMany({ _id: { $in: ids } })
    await mongoose.disconnect()
  })

  it('charges the server price for a featured listing, whatever the request says', async () => {
    const res = await post(business, ['business'], '/workflows', { kind: 'business_subscription', data: { amount: 0.01 } })
    expect(res.status).toBe(201)
    expect((await res.json()).data.data.amount).toBe(50)
    expect((await Wallet.findOne({ userId: String(business) }).lean())?.balance).toBe(50)
    expect((await Business.findOne({ ownerId: String(business) }).lean())?.subscriptionTier).toBe('featured')
  })

  it('holds an off-plan listing for moderation however it was submitted', async () => {
    const res = await post(developer, ['developer'], '/workflows', { kind: 'offplan_listing', status: 'published', data: { title: 'Sky Towers' } })
    expect(res.status).toBe(201)
    const listing = (await res.json()).data
    expect(listing.status).toBe('pending_review')
    const publicList = async () => (await (await fetch(`${url}/developer/offplan`)).json()).data.items.map((i: { id: string }) => i.id)
    expect(await publicList()).not.toContain(listing.id)

    // The author cannot publish it by editing the status either.
    const patch = await fetch(`${url}/workflows/${listing.id}`, { method: 'PATCH', headers: headers(developer, ['developer']), body: JSON.stringify({ status: 'active' }) })
    expect(patch.status).toBe(403)
    expect(await publicList()).not.toContain(listing.id)

    // Moderation publishes it; an author edit sends it back for review.
    expect((await post(developer, ['developer'], `/workflows/${listing.id}/review`, { decision: 'approve' })).status).toBe(403)
    expect((await post(admin, ['admin'], `/workflows/${listing.id}/review`, { decision: 'approve' })).status).toBe(200)
    expect(await publicList()).toContain(listing.id)
    const edit = await fetch(`${url}/workflows/${listing.id}`, { method: 'PATCH', headers: headers(developer, ['developer']), body: JSON.stringify({ status: 'pending_review', data: { title: 'Totally different' } }) })
    expect((await edit.json()).data.status).toBe('pending_review')
    expect(await publicList()).not.toContain(listing.id)
  })

  it('shows fraud watch only the payment fields a signal needs', async () => {
    const res = await fetch(`${url}/government/fraud-watch`, { headers: headers(government, ['government']) })
    expect(res.status).toBe(200)
    const { suspiciousPayments } = (await res.json()).data as { suspiciousPayments: Record<string, unknown>[] }
    const row = suspiciousPayments.find((p) => p.amount === 42 && p.method === 'mtn_momo')
    expect(row).toBeDefined()
    expect(Object.keys(row!).sort()).toEqual(['amount', 'createdAt', 'id', 'method', 'purpose'])
    expect(JSON.stringify(suspiciousPayments)).not.toContain(failedRef)
    expect(JSON.stringify(suspiciousPayments)).not.toContain(String(business))
  })
})

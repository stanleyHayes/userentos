import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { Investment } from '../models/Investment.js'
import { InvestmentPartner } from '../models/InvestmentPartner.js'
import { InvestmentProduct } from '../models/InvestmentProduct.js'
import { Wallet } from '../models/Wallet.js'
import { errorHandler } from '../middleware/errorHandler.js'
import router from '../routes/investments.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../utils/audit.js', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }))

const uri = testMongoUri
describe.skipIf(!hasTestMongo)('partner-settled investments', () => {
  const investor = String(new mongoose.Types.ObjectId())
  const admin = String(new mongoose.Types.ObjectId())
  const partnerIds: string[] = []
  let server: Server
  let base = ''
  let productId = ''

  const token = (userId: string, roles: string[], permissions: string[] = []) =>
    jwt.sign({ userId, roles, permissions, purpose: 'session' }, config.jwtSecret, { expiresIn: '5m' })
  const investorToken = token(investor, ['tenant'])
  const adminToken = token(admin, ['admin'], ['payments:process'])
  const call = (path: string, auth: string, body?: unknown) => fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const balance = async () => (await Wallet.findOne({ userId: investor }).lean())?.balance ?? 0

  async function invest(amount = 1000) {
    const res = await call('/api/investments', investorToken, { productId, amount, riskDisclosureAccepted: true })
    expect(res.status).toBe(201)
    return (await res.json()).data.investment.id as string
  }

  beforeAll(async () => {
    await mongoose.connect(uri)
    await Promise.all([Investment.init(), Wallet.init()])
    vi.spyOn(User, 'exists').mockResolvedValue({ _id: new mongoose.Types.ObjectId() })
    await Wallet.create({ userId: investor, balance: 10000, transactions: [] })
    const app = express(); app.use(express.json()); app.use('/api/investments', router); app.use(errorHandler)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    const partner = await (await call('/api/investments/partners', adminToken, { name: 'Fixture Fund Manager', regulator: 'SEC', licenseNumber: 'SEC-FIXTURE-1' })).json()
    partnerIds.push(partner.data.id)
    const product = await (await call('/api/investments/products', adminToken, {
      partnerId: partner.data.id, name: 'Fixture 91-day bill', type: 'treasury_bill', tenureDays: 91,
      indicativeAnnualRate: 20, minAmount: 100, riskWarning: 'Value can fall; returns are not guaranteed.', active: true,
    })).json()
    productId = product.data.id
  })

  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    vi.restoreAllMocks()
    await Promise.all([
      Investment.deleteMany({ userId: investor }), Wallet.deleteMany({ userId: investor }),
      InvestmentProduct.deleteMany({ partnerId: { $in: partnerIds } }), InvestmentPartner.deleteMany({ _id: { $in: partnerIds } }),
    ])
    await mongoose.disconnect()
  })

  it('lists only admin-configured products of verified partners', async () => {
    const { data } = await (await call('/api/investments/options', investorToken)).json()
    expect(data.products.map((p: { id: string }) => p.id)).toContain(productId)
    expect(JSON.stringify(data)).not.toMatch(/Databank|Epack/)
    expect(data.disclaimer).toMatch(/not guaranteed/i)
  })

  it('holds a new order as pending until the partner confirms it', async () => {
    const before = await balance()
    const id = await invest()
    expect(await balance()).toBe(before - 1000)
    expect((await Investment.findById(id).lean())?.status).toBe('pending')
    const confirmed = await call(`/api/investments/${id}/confirm`, adminToken, { partnerReference: `PLACE-${id}` })
    expect(confirmed.status).toBe(200)
    expect((await Investment.findById(id).lean())).toMatchObject({ status: 'active', partnerReference: `PLACE-${id}` })
  })

  it('a partner rejection refunds the order', async () => {
    const before = await balance()
    const id = await invest(500)
    expect((await call(`/api/investments/${id}/reject`, adminToken, { reason: 'Partner closed the issue' })).status).toBe(200)
    expect(await balance()).toBe(before)
    expect((await Investment.findById(id).lean())?.status).toBe('rejected')
  })

  it('withdrawal is a request; only the recorded partner settlement credits the wallet, once', async () => {
    const id = await invest()
    await call(`/api/investments/${id}/confirm`, adminToken, { partnerReference: `PLACE-${id}` })
    const before = await balance()
    const requested = await call(`/api/investments/${id}/withdraw`, investorToken, {})
    expect(requested.status).toBe(200)
    expect(await balance()).toBe(before)
    expect((await Investment.findById(id).lean())?.status).toBe('redemption_requested')

    expect((await call(`/api/investments/${id}/settle`, investorToken, { settlementReference: 'SELF-PAY-1', amount: 5000 })).status).toBe(403)
    const reference = `PARTNER-PAY-${id}`
    expect((await call(`/api/investments/${id}/settle`, adminToken, { settlementReference: reference, amount: 1012.5 })).status).toBe(200)
    expect(await balance()).toBe(before + 1012.5)
    expect((await Investment.findById(id).lean())).toMatchObject({ settledAmount: 1012.5, settlementReference: reference, actualReturn: 12.5 })

    const other = await invest()
    await call(`/api/investments/${other}/confirm`, adminToken, { partnerReference: `PLACE-${other}` })
    await call(`/api/investments/${other}/withdraw`, investorToken, {})
    const reused = await call(`/api/investments/${other}/settle`, adminToken, { settlementReference: reference, amount: 1000 })
    expect(reused.status).toBe(409)
    expect((await Investment.findById(other).lean())?.status).toBe('redemption_requested')
  })
})

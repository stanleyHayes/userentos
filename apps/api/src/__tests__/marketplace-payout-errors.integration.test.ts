import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFileSync } from 'node:fs'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// The provider fails the way it did in production: its message names a server setting.
vi.mock('../services/marketplace/paystack.js', async (orig) => ({
  ...(await orig() as Record<string, unknown>),
  listBanks: vi.fn(async () => { throw new Error('PAYSTACK_SECRET_KEY is not set — marketplace payments cannot run') }),
  resolveAccount: vi.fn(async () => ({ accountName: 'Ama Mensah' })),
  updateSubaccount: vi.fn(async () => { throw new Error('Paystack /subaccount failed (500): upstream timeout') }),
}))
vi.mock('../services/entitlements.js', async (orig) => ({
  ...(await orig() as Record<string, unknown>),
  getNumericFeature: vi.fn().mockResolvedValue(5),
}))
vi.mock('../utils/audit.js', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }))

import { config } from '../config/index.js'
import { PaymentAccount } from '../models/PaymentAccount.js'
import { User } from '../models/User.js'
import router from '../routes/marketplacePayments.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

/*
 * Payout set-up errors must neither leak provider text (it named the missing
 * PAYSTACK_SECRET_KEY) nor break a payout account that already works.
 */
describe.skipIf(!hasTestMongo)('marketplace payout account errors', () => {
  const seller = new mongoose.Types.ObjectId()
  let server: Server, url: string
  const headers = {
    Authorization: `Bearer ${jwt.sign({ userId: String(seller), roles: ['service_provider'], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`,
    'Content-Type': 'application/json',
  }
  const account = { businessName: 'Ama Repairs', bankCode: 'MTN', bankName: 'MTN Mobile Money', accountNumber: '0241234567' }

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await User.create({ _id: seller, email: `payout-errors-${seller}@rentos.test`, phone: '0241234567', firstName: 'Ama', lastName: 'Mensah', passwordHash: 'fixture-only', roles: ['service_provider'], activeRole: 'service_provider' })
    const app = express(); app.use(express.json()); app.use('/api/marketplace/payments', router)
    server = await new Promise<Server>((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/marketplace/payments`
  })
  afterEach(() => { vi.unstubAllEnvs() })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await PaymentAccount.deleteMany({ ownerId: String(seller) })
    await User.deleteMany({ _id: seller })
    await mongoose.disconnect()
  })

  it('refuses before touching anything while live payments have no provider key', async () => {
    vi.stubEnv('PAYMENTS_PROVIDER_MODE', 'live')
    vi.stubEnv('PAYSTACK_SECRET_KEY', '')
    for (const [method, path, body] of [['GET', '/banks', undefined], ['POST', '/account', JSON.stringify(account)]] as const) {
      const res = await fetch(`${url}${path}`, { method, headers, body })
      expect(res.status).toBe(503)
      const text = await res.text()
      expect(text).toContain('Payments are not available right now')
      expect(text).not.toMatch(/PAYSTACK/i)
    }
    expect(await PaymentAccount.countDocuments({ ownerId: String(seller) })).toBe(0)
  })

  it('answers a provider failure in its own words, without the provider text', async () => {
    const res = await fetch(`${url}/banks`, { headers })
    expect(res.status).toBe(502)
    expect(await res.text()).not.toMatch(/PAYSTACK/i)
  })

  it('keeps a working payout account ready when a change fails at the provider', async () => {
    await PaymentAccount.create({
      ownerId: String(seller), provider: 'paystack', subaccountCode: 'ACCT_working', businessName: 'Ama Repairs', bankCode: 'MTN', bankName: 'MTN Mobile Money',
      accountNumberMasked: '••••4567', status: 'ready', readyToReceivePayments: true, verifiedAt: new Date(),
    })
    const res = await fetch(`${url}/account`, { method: 'POST', headers, body: JSON.stringify({ ...account, accountNumber: '0249999999' }) })
    expect(res.status).toBe(502)
    const text = await res.text()
    expect(text).toContain('Could not set up payouts with the provider')
    expect(text).not.toMatch(/Paystack \/subaccount|upstream timeout/)
    const saved = await PaymentAccount.findOne({ ownerId: String(seller) }).lean()
    expect(saved).toMatchObject({ status: 'ready', readyToReceivePayments: true, accountNumberMasked: '••••4567' })
    expect(saved?.failureReason).toBeUndefined()
  })
})

it('no marketplace payment response passes on the provider\'s own error text', () => {
  // Those messages can name server settings ("PAYSTACK_SECRET_KEY is not set…"); they belong in the log.
  const source = readFileSync(new URL('../routes/marketplacePayments.ts', import.meta.url), 'utf8')
  expect(source).not.toMatch(/error\(res, `[^`]*\$\{\(err as Error\)\.message\}/)
})

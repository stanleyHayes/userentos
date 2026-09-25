import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import jwt from 'jsonwebtoken'
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { config } from '../config/index.js'
import { Investment } from '../models/Investment.js'
import { InvestmentPartner } from '../models/InvestmentPartner.js'
import { InvestmentProduct } from '../models/InvestmentProduct.js'
import { creditWallet, debitWallet } from '../services/payments/walletLedger.js'

vi.mock('../models/User.js', () => ({ User: { exists: vi.fn().mockResolvedValue({ _id: 'active-user' }) } }))
vi.mock('../models/Investment.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../models/Investment.js')>()),
  Investment: { find: vi.fn(), findById: vi.fn(), create: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() },
}))
vi.mock('../models/InvestmentPartner.js', () => ({ InvestmentPartner: { find: vi.fn(), findOne: vi.fn(), create: vi.fn() } }))
vi.mock('../models/InvestmentProduct.js', () => ({ InvestmentProduct: { find: vi.fn(), findOne: vi.fn(), create: vi.fn() } }))
vi.mock('../models/Wallet.js', () => ({ Wallet: { findOne: vi.fn(() => ({ lean: async () => ({ balance: 0 }) })), exists: vi.fn() } }))
vi.mock('../services/payments/walletLedger.js', () => ({ creditWallet: vi.fn(), debitWallet: vi.fn() }))
vi.mock('../utils/audit.js', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }))

const { default: investmentsRouter } = await import('../routes/investments.js')

const USER = '65f1a2b3c4d5e6f7a8b9c0d1'
const token = (roles: string[], permissions: string[] = []) => jwt.sign({ userId: USER, roles, permissions, purpose: 'session' }, config.jwtSecret)
const lean = <T>(value: T) => ({ lean: async () => value })

describe('investments API honesty', () => {
  let server: Server
  let base = ''
  const post = (path: string, body: unknown, auth = token(['tenant'])) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` }, body: JSON.stringify(body),
  })

  beforeAll(async () => {
    const app = express(); app.use(express.json()); app.use('/', investmentsRouter)
    await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => { await new Promise((resolve) => server.close(resolve)) })
  beforeEach(() => { vi.clearAllMocks() })

  it('contains no hardcoded firms or fixed rates', () => {
    const source = readFileSync(new URL('../routes/investments.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/Databank|Epack|25\.5|33\.5/)
  })

  it('offers nothing when no verified partner product is configured', async () => {
    vi.mocked(InvestmentPartner.find).mockReturnValue(lean([]) as never)
    vi.mocked(InvestmentProduct.find).mockReturnValue(lean([]) as never)
    const res = await fetch(`${base}/options`, { headers: { Authorization: `Bearer ${token(['tenant'])}` } })
    const { data } = await res.json()
    expect(data.products).toEqual([])
    expect(data.disclaimer).toMatch(/not guaranteed/i)
    expect(data.disclaimer).not.toMatch(/handled by licensed institutions/i)
  })

  it('refuses a product whose partner is not verified and active', async () => {
    vi.mocked(InvestmentProduct.findOne).mockReturnValue(lean({ _id: 'p1', partnerId: 'x', active: true, minAmount: 100, tenureDays: 91, type: 'treasury_bill' }) as never)
    vi.mocked(InvestmentPartner.findOne).mockReturnValue(lean(null) as never)
    const res = await post('/', { productId: '65f1a2b3c4d5e6f7a8b9c0d9', amount: 500, riskDisclosureAccepted: true })
    expect(res.status).toBe(400)
    expect(vi.mocked(debitWallet)).not.toHaveBeenCalled()
  })

  it('a withdrawal request never pays the investor out of platform funds', async () => {
    vi.mocked(Investment.findOneAndUpdate).mockResolvedValue({ _id: 'inv-1', toObject: () => ({ _id: 'inv-1', status: 'redemption_requested' }) } as never)
    const res = await post('/65f1a2b3c4d5e6f7a8b9c0d3/withdraw', {})
    expect(res.status).toBe(200)
    expect(vi.mocked(creditWallet)).not.toHaveBeenCalled()
  })

  it('only an admin can record a partner settlement', async () => {
    const res = await post('/65f1a2b3c4d5e6f7a8b9c0d3/settle', { settlementReference: 'PARTNER-1', amount: 100 })
    expect(res.status).toBe(403)
    expect(vi.mocked(creditWallet)).not.toHaveBeenCalled()
    expect(vi.mocked(Investment.findOneAndUpdate)).not.toHaveBeenCalled()
  })
})

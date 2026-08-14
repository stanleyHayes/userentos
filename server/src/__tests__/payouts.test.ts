import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import jwt from 'jsonwebtoken'
import { createHmac } from 'crypto'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { config } from '../config/index.js'
import { Payout } from '../models/Payout.js'
import { PayoutAccount } from '../models/PayoutAccount.js'
import { creditWallet, debitWallet } from '../services/payments/walletLedger.js'
import { paystackPayoutProvider } from '../services/payouts/paystack.js'
import { finalizePayout } from '../services/payouts/finalize.js'

vi.mock('../models/Payout.js', async () => {
  const actual = await vi.importActual<typeof import('../models/Payout.js')>('../models/Payout.js')
  return {
    ...actual,
    Payout: { find: vi.fn(), findOne: vi.fn(), findById: vi.fn(), findOneAndUpdate: vi.fn(), create: vi.fn(), countDocuments: vi.fn(), updateOne: vi.fn() },
  }
})
vi.mock('../models/PayoutAccount.js', () => ({
  PayoutAccount: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), deleteOne: vi.fn() },
}))
vi.mock('../models/Wallet.js', () => ({
  Wallet: { findOne: vi.fn() },
}))
vi.mock('../models/User.js', () => ({
  User: { find: vi.fn(), findById: vi.fn() },
}))
vi.mock('../models/AuditLog.js', () => ({
  AuditLog: { create: vi.fn().mockResolvedValue({}) },
}))
vi.mock('../services/payments/walletLedger.js', () => ({
  creditWallet: vi.fn().mockResolvedValue(undefined),
  debitWallet: vi.fn().mockResolvedValue(true),
}))
vi.mock('../services/notify.js', () => ({
  notify: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../utils/audit.js', () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}))

// Simulated mode — no PSP credentials, no real transfers.
process.env.PAYMENTS_PROVIDER_MODE = 'simulated'

const { default: payoutRouter } = await import('../routes/payouts.js')

function token(roles: string[], permissions: string[] = [], userId = 'user-1') {
  return jwt.sign({ userId, email: 'u@rentos.test', roles, permissions, purpose: 'session' }, config.jwtSecret)
}

const asUser = () => ({ authorization: `Bearer ${token(['landlord'])}`, 'content-type': 'application/json' })
const asAdmin = () => ({ authorization: `Bearer ${token(['super_admin'], [], 'admin-1')}`, 'content-type': 'application/json' })

const ACCOUNT = {
  userId: 'user-1',
  type: 'mobile_money',
  accountNumber: '0244123456',
  bankCode: 'MTN',
  bankName: 'MTN Mobile Money',
  accountName: 'Yaw Boateng',
  recipientCode: 'SIM-RCP-3456-ABCDEF',
  verified: true,
}

describe('payouts', () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use('/api/payouts', payoutRouter)
    await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()) })
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/payouts`
  })

  afterAll(async () => { await new Promise((resolve) => server.close(resolve)) })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(debitWallet).mockResolvedValue(true)
    vi.mocked(creditWallet).mockResolvedValue(undefined)
  })

  it('refuses a payout request when no account is set up', async () => {
    vi.mocked(PayoutAccount.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as never)

    const res = await fetch(baseUrl, { method: 'POST', headers: asUser(), body: JSON.stringify({ amount: 500 }) })
    expect(res.status).toBe(409)
    expect(debitWallet).not.toHaveBeenCalled()
  })

  it('refuses an amount below the minimum before touching the wallet', async () => {
    const res = await fetch(baseUrl, { method: 'POST', headers: asUser(), body: JSON.stringify({ amount: 5 }) })
    expect(res.status).toBe(400)
    expect(debitWallet).not.toHaveBeenCalled()
  })

  it('debits the wallet when the request is accepted', async () => {
    vi.mocked(PayoutAccount.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(ACCOUNT) } as never)
    vi.mocked(Payout.countDocuments).mockResolvedValue(0 as never)
    vi.mocked(Payout.create).mockImplementation((async (doc: Record<string, unknown>) => ({
      ...doc, _id: { toString: () => 'payout-1' },
    })) as never)

    const res = await fetch(baseUrl, { method: 'POST', headers: asUser(), body: JSON.stringify({ amount: 500 }) })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.amount).toBe(500)
    expect(body.data.status).toBe('requested')
    // Debited up front so the same balance cannot be requested twice.
    expect(debitWallet).toHaveBeenCalledWith('user-1', 500, expect.objectContaining({ type: 'withdrawal' }))
  })

  it('refunds the wallet when the payout record cannot be written', async () => {
    vi.mocked(PayoutAccount.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(ACCOUNT) } as never)
    vi.mocked(Payout.countDocuments).mockResolvedValue(0 as never)
    vi.mocked(Payout.create).mockRejectedValue(new Error('db down') as never)

    const res = await fetch(baseUrl, { method: 'POST', headers: asUser(), body: JSON.stringify({ amount: 500 }) })

    expect(res.status).toBe(500)
    expect(creditWallet).toHaveBeenCalledWith('user-1', 500, expect.objectContaining({ type: 'refund' }))
  })

  it('rejects a second request while one is in flight', async () => {
    vi.mocked(PayoutAccount.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(ACCOUNT) } as never)
    vi.mocked(Payout.countDocuments).mockResolvedValue(1 as never)

    const res = await fetch(baseUrl, { method: 'POST', headers: asUser(), body: JSON.stringify({ amount: 500 }) })
    expect(res.status).toBe(409)
    expect(debitWallet).not.toHaveBeenCalled()
  })

  it('only lets an admin approve, and claims the payout before sending', async () => {
    const claimed = {
      _id: { toString: () => 'payout-1' },
      userId: 'user-1',
      amount: 500,
      reference: 'PO-TEST-1',
      status: 'processing',
      destination: { ...ACCOUNT, type: 'mobile_money' },
      save: vi.fn(async () => undefined),
    }
    vi.mocked(Payout.findById).mockResolvedValue({ ...claimed, status: 'requested' } as never)
    vi.mocked(Payout.findOneAndUpdate).mockResolvedValue(claimed as never)

    const denied = await fetch(`${baseUrl}/payout-1/approve`, { method: 'POST', headers: asUser() })
    expect(denied.status).toBe(403)

    const res = await fetch(`${baseUrl}/payout-1/approve`, { method: 'POST', headers: asAdmin() })
    expect(res.status).toBe(200)
    // The claim excludes anything already picked up.
    expect(Payout.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'requested' }),
      expect.objectContaining({ $set: expect.objectContaining({ status: 'processing' }) }),
      expect.anything(),
    )
    expect(claimed.save).toHaveBeenCalled()
  })

  it('declining refunds the requester', async () => {
    vi.mocked(Payout.findOneAndUpdate).mockResolvedValue({
      _id: { toString: () => 'payout-1' },
      userId: 'user-1',
      amount: 500,
      reference: 'PO-TEST-1',
      status: 'failed',
      failureReason: 'Account mismatch',
      destination: ACCOUNT,
    } as never)

    const res = await fetch(`${baseUrl}/payout-1/decline`, {
      method: 'POST', headers: asAdmin(), body: JSON.stringify({ reason: 'Account mismatch' }),
    })

    expect(res.status).toBe(200)
    expect(creditWallet).toHaveBeenCalledWith('user-1', 500, expect.objectContaining({ type: 'refund' }))
  })
})

describe('payout finalizer', () => {
  const payout = () => ({
    _id: 'payout-1',
    userId: 'user-1',
    amount: 500,
    reference: 'PO-TEST-1',
    destination: { bankName: 'MTN Mobile Money', accountNumber: '0244123456' },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(creditWallet).mockResolvedValue(undefined)
  })

  it('settles a successful transfer without refunding', async () => {
    vi.mocked(Payout.findOne).mockResolvedValue(payout() as never)
    vi.mocked(Payout.findOneAndUpdate).mockResolvedValue({ ...payout(), status: 'paid' } as never)

    const moved = await finalizePayout({
      reference: 'PO-TEST-1', providerRef: 'TRF_1', status: 'paid', amount: 500,
      timestamp: new Date().toISOString(), raw: {},
    }, { source: 'webhook' })

    expect(moved).toBe(true)
    expect(creditWallet).not.toHaveBeenCalled()
  })

  it('refunds the wallet when the transfer fails', async () => {
    vi.mocked(Payout.findOne).mockResolvedValue(payout() as never)
    vi.mocked(Payout.findOneAndUpdate).mockResolvedValue({ ...payout(), status: 'failed', failureReason: 'Declined' } as never)

    const moved = await finalizePayout({
      reference: 'PO-TEST-1', providerRef: 'TRF_1', status: 'failed', amount: 500,
      timestamp: new Date().toISOString(), failureReason: 'Declined', raw: {},
    }, { source: 'webhook' })

    expect(moved).toBe(true)
    expect(creditWallet).toHaveBeenCalledWith('user-1', 500, expect.objectContaining({ type: 'refund' }))
  })

  it('does not refund twice when the same failure webhook is replayed', async () => {
    vi.mocked(Payout.findOne).mockResolvedValue({ ...payout(), status: 'failed', refunded: true } as never)
    // The guarded update matches nothing the second time around.
    vi.mocked(Payout.findOneAndUpdate).mockResolvedValue(null as never)

    const moved = await finalizePayout({
      reference: 'PO-TEST-1', providerRef: 'TRF_1', status: 'failed', amount: 500,
      timestamp: new Date().toISOString(), raw: {},
    }, { source: 'webhook' })

    expect(moved).toBe(false)
    expect(creditWallet).not.toHaveBeenCalled()
  })

  it('refuses to settle when the provider reports a different amount', async () => {
    vi.mocked(Payout.findOne).mockResolvedValue(payout() as never)

    const moved = await finalizePayout({
      reference: 'PO-TEST-1', providerRef: 'TRF_1', status: 'paid', amount: 5000,
      timestamp: new Date().toISOString(), raw: {},
    }, { source: 'webhook' })

    expect(moved).toBe(false)
    expect(Payout.findOneAndUpdate).not.toHaveBeenCalled()
  })
})

describe('paystack adapter', () => {
  const SECRET = 'sk_test_abc123'

  beforeEach(() => { process.env.PAYSTACK_SECRET_KEY = SECRET })

  it('accepts a correctly signed webhook and rejects a tampered one', () => {
    const body = JSON.stringify({ event: 'transfer.success', data: { reference: 'PO-1', amount: 50000, transfer_code: 'TRF_1' } })
    const signature = createHmac('sha512', SECRET).update(body, 'utf8').digest('hex')

    expect(paystackPayoutProvider.verifyWebhook(body, { 'x-paystack-signature': signature })).toBe(true)
    expect(paystackPayoutProvider.verifyWebhook(`${body} `, { 'x-paystack-signature': signature })).toBe(false)
    expect(paystackPayoutProvider.verifyWebhook(body, {})).toBe(false)
    expect(paystackPayoutProvider.verifyWebhook(body, { 'x-paystack-signature': 'deadbeef' })).toBe(false)
  })

  it('converts pesewas back to cedis and maps event names to a status', () => {
    const success = paystackPayoutProvider.parseWebhook(JSON.stringify({
      event: 'transfer.success', data: { reference: 'PO-1', amount: 50000, transfer_code: 'TRF_1' },
    }))
    expect(success.status).toBe('paid')
    expect(success.amount).toBe(500)

    // A reversal returns the money to us, so it has to be treated as a failure
    // or the user's wallet never gets credited back.
    const reversed = paystackPayoutProvider.parseWebhook(JSON.stringify({
      event: 'transfer.reversed', data: { reference: 'PO-1', amount: 50000, transfer_code: 'TRF_1' },
    }))
    expect(reversed.status).toBe('failed')
    expect(reversed.failureReason).toBeTruthy()
  })

  it('rejects non-transfer events so charges are never mistaken for payouts', () => {
    expect(() => paystackPayoutProvider.parseWebhook(JSON.stringify({ event: 'charge.success', data: { amount: 100 } })))
      .toThrow(/Not a transfer event/)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Payment } from '../models/Payment.js'
import { paymentCreditIntent, recoverPaymentWalletCredit } from '../services/payments/paymentWalletCredit.js'
import { finalizePayment } from '../services/payments/finalize.js'

vi.mock('../models/Payment.js', () => ({
  Payment: { findOne: vi.fn(), findOneAndUpdate: vi.fn() },
}))
vi.mock('../models/User.js', () => ({
  User: { findById: vi.fn(() => ({ select: () => ({ lean: async () => ({ firstName: 'Kwame', lastName: 'Asante' }) }) })), updateOne: vi.fn() },
}))
vi.mock('../models/SubscriptionPackage.js', () => ({
  SubscriptionPackage: { findById: vi.fn() },
}))
vi.mock('../models/AuditLog.js', () => ({
  AuditLog: { create: vi.fn().mockResolvedValue({}) },
}))
vi.mock('../services/payments/paymentWalletCredit.js', async original => ({ ...await original<typeof import('../services/payments/paymentWalletCredit.js')>(), recoverPaymentWalletCredit: vi.fn().mockResolvedValue(true) }))
vi.mock('../services/payments/recoverRentReceipts.js', () => ({ recoverRentReceipt: vi.fn().mockResolvedValue('skipped') }))
vi.mock('../services/notify.js', () => ({
  notifyPaymentConfirmed: vi.fn().mockResolvedValue(undefined),
  notifyPaymentReceived: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../services/achievements.js', () => ({
  checkAndAward: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../services/webhooks.js', () => ({
  dispatchWebhook: vi.fn().mockResolvedValue(undefined),
}))

function rentPayment(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'pay-1',
    tenantId: 'tenant-1',
    landlordId: 'landlord-1',
    amount: 1200,
    reference: 'PAY-RENT-1',
    purpose: 'rent',
    status: 'pending',
    ...overrides,
  }
}

const event = {
  reference: 'PAY-RENT-1',
  providerRef: 'MOMO-1',
  status: 'completed' as const,
  currency: 'GHS',
  amount: 1200,
  timestamp: new Date().toISOString(),
  raw: {},
}

describe('completed rent reaches the landlord', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(recoverPaymentWalletCredit).mockResolvedValue(true)
  })

  it('credits the landlord wallet for the rent amount', async () => {
    vi.mocked(Payment.findOne).mockResolvedValue(rentPayment() as never)
    vi.mocked(Payment.findOneAndUpdate).mockResolvedValue(rentPayment({ status: 'completed', walletCreditIntent: paymentCreditIntent(rentPayment()) }) as never)

    await finalizePayment(event, { source: 'webhook' })

    expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ status: 'completed', walletCreditIntent: expect.objectContaining({ userId: 'landlord-1', amount: 1200, type: 'rent_payment' }) }) }), expect.objectContaining({ overwriteImmutable: true }))
    expect(recoverPaymentWalletCredit).toHaveBeenCalledWith('pay-1')
  })

  it('does not credit anyone twice when the webhook is replayed', async () => {
    vi.mocked(Payment.findOne).mockResolvedValue(rentPayment({ status: 'completed' }) as never)
    // The guarded update excludes terminal states, so the replay matches nothing.
    vi.mocked(Payment.findOneAndUpdate).mockResolvedValue(null as never)

    await finalizePayment(event, { source: 'webhook' })

    expect(recoverPaymentWalletCredit).not.toHaveBeenCalled()
  })

  it('refuses confirmation when the rent beneficiary is missing', async () => {
    vi.mocked(Payment.findOne).mockResolvedValue(rentPayment({ landlordId: undefined }) as never)
    vi.mocked(Payment.findOneAndUpdate).mockResolvedValue(rentPayment({ landlordId: undefined, status: 'completed' }) as never)

    await expect(finalizePayment(event, { source: 'webhook' })).rejects.toThrow('require resolution')
    expect(Payment.findOneAndUpdate).not.toHaveBeenCalled()

    expect(recoverPaymentWalletCredit).not.toHaveBeenCalled()
  })

  it('still credits the payer for a wallet deposit, not the landlord', async () => {
    const deposit = rentPayment({ purpose: 'wallet_deposit', landlordId: undefined })
    vi.mocked(Payment.findOne).mockResolvedValue(deposit as never)
    vi.mocked(Payment.findOneAndUpdate).mockResolvedValue({ ...deposit, status: 'completed', walletCreditIntent: paymentCreditIntent(deposit) } as never)

    await finalizePayment(event, { source: 'webhook' })

    expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ walletCreditIntent: expect.objectContaining({ userId: 'tenant-1', amount: 1200, type: 'deposit' }) }) }), expect.anything())
    expect(recoverPaymentWalletCredit).toHaveBeenCalledWith('pay-1')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Payment } from '../models/Payment.js'
import { creditWallet } from '../services/payments/walletLedger.js'
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
vi.mock('../services/payments/walletLedger.js', () => ({
  creditWallet: vi.fn().mockResolvedValue(undefined),
}))
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
  amount: 1200,
  timestamp: new Date().toISOString(),
  raw: {},
}

describe('completed rent reaches the landlord', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(creditWallet).mockResolvedValue(undefined)
  })

  it('credits the landlord wallet for the rent amount', async () => {
    vi.mocked(Payment.findOne).mockResolvedValue(rentPayment() as never)
    vi.mocked(Payment.findOneAndUpdate).mockResolvedValue(rentPayment({ status: 'completed' }) as never)

    await finalizePayment(event, { source: 'webhook' })

    expect(creditWallet).toHaveBeenCalledWith('landlord-1', 1200, expect.objectContaining({
      type: 'rent_payment',
      reference: 'PAY-RENT-1',
    }))
  })

  it('does not credit anyone twice when the webhook is replayed', async () => {
    vi.mocked(Payment.findOne).mockResolvedValue(rentPayment({ status: 'completed' }) as never)
    // The guarded update excludes terminal states, so the replay matches nothing.
    vi.mocked(Payment.findOneAndUpdate).mockResolvedValue(null as never)

    await finalizePayment(event, { source: 'webhook' })

    expect(creditWallet).not.toHaveBeenCalled()
  })

  it('skips the credit when the rent payment has no landlord', async () => {
    vi.mocked(Payment.findOne).mockResolvedValue(rentPayment({ landlordId: undefined }) as never)
    vi.mocked(Payment.findOneAndUpdate).mockResolvedValue(rentPayment({ landlordId: undefined, status: 'completed' }) as never)

    await finalizePayment(event, { source: 'webhook' })

    expect(creditWallet).not.toHaveBeenCalled()
  })

  it('still credits the payer for a wallet deposit, not the landlord', async () => {
    const deposit = rentPayment({ purpose: 'wallet_deposit', landlordId: undefined })
    vi.mocked(Payment.findOne).mockResolvedValue(deposit as never)
    vi.mocked(Payment.findOneAndUpdate).mockResolvedValue({ ...deposit, status: 'completed' } as never)

    await finalizePayment(event, { source: 'webhook' })

    expect(creditWallet).toHaveBeenCalledWith('tenant-1', 1200, expect.objectContaining({ type: 'deposit' }))
  })
})

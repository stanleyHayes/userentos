import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Wallet } from '../models/Wallet.js'
import { creditWallet, debitWallet } from '../services/payments/walletLedger.js'

vi.mock('../models/Wallet.js', () => ({
  Wallet: { findOneAndUpdate: vi.fn() },
}))

/**
 * The ledger writes balances with an aggregation-pipeline update (the array
 * form), which Mongoose 9 refuses unless `updatePipeline: true` is passed. It
 * was missing, so every credit and debit threw at runtime — savings
 * contributions, refunds, loan disbursement, rent credits, payouts, all of it —
 * while unit tests that mock the ledger stayed green.
 *
 * These assertions are deliberately white-box: the option is invisible in
 * behaviour until it hits a real database, so pin it here.
 */
describe('wallet ledger', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes updatePipeline when crediting, or Mongoose rejects the array update', async () => {
    vi.mocked(Wallet.findOneAndUpdate).mockResolvedValue({ balance: 100 } as never)

    await creditWallet('user-1', 100, { type: 'deposit', reference: 'R1', description: 'test' })

    const [filter, update, options] = vi.mocked(Wallet.findOneAndUpdate).mock.calls[0]
    expect(filter).toEqual({ userId: 'user-1' })
    expect(Array.isArray(update)).toBe(true)
    expect(options).toMatchObject({ updatePipeline: true, upsert: true })
  })

  it('passes updatePipeline when debiting, and guards the balance in the filter', async () => {
    vi.mocked(Wallet.findOneAndUpdate).mockResolvedValue({ balance: 0 } as never)

    const ok = await debitWallet('user-1', 100, { type: 'withdrawal', reference: 'R2', description: 'test' })

    expect(ok).toBe(true)
    const [filter, update, options] = vi.mocked(Wallet.findOneAndUpdate).mock.calls[0]
    // The $gte guard is what stops a balance going negative under concurrency.
    expect(filter).toMatchObject({ userId: 'user-1', balance: { $gte: 100 } })
    expect(Array.isArray(update)).toBe(true)
    expect(options).toMatchObject({ updatePipeline: true })
  })

  it('reports insufficient funds instead of throwing when the guard matches nothing', async () => {
    vi.mocked(Wallet.findOneAndUpdate).mockResolvedValue(null as never)

    await expect(debitWallet('user-1', 100, { type: 'withdrawal', reference: 'R3', description: 'test' }))
      .resolves.toBe(false)
  })

  it('refuses invalid amounts on both sides', async () => {
    await expect(creditWallet('user-1', 0, { type: 'deposit' })).rejects.toThrow(/Invalid wallet credit/)
    await expect(creditWallet('user-1', -5, { type: 'deposit' })).rejects.toThrow(/Invalid wallet credit/)
    await expect(debitWallet('user-1', Number.NaN, { type: 'withdrawal' })).rejects.toThrow(/Invalid wallet debit/)
    expect(Wallet.findOneAndUpdate).not.toHaveBeenCalled()
  })
})

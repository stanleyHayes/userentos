import { describe, it, expect, vi, beforeEach } from 'vitest'

const findOneAndUpdate = vi.fn()
vi.mock('../models/Sponsorship.js', () => ({ Sponsorship: { findOneAndUpdate } }))

const { applySuccessfulCharge } = await import('../services/marketplace/settle.js')

type Txn = {
  reference: string
  status: string
  grossAmount: number
  discountAmount: number
  platformFeeAmount: number
  sponsorshipId?: string
  verifiedAt?: Date
  processorFeeAmount?: number
  settlementStatus?: string
  save: ReturnType<typeof vi.fn>
}

const txn = (o: Partial<Txn> = {}): Txn => ({
  reference: 'MKT-1',
  status: 'pending',
  grossAmount: 1000,
  discountAmount: 0,
  platformFeeAmount: 50,
  save: vi.fn().mockResolvedValue(undefined),
  ...o,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const settle = (t: Txn, v: unknown, s: 'webhook' | 'verify' = 'webhook') => applySuccessfulCharge(t as any, v as any, s)

describe('applying a successful charge (one path for webhook and verify)', () => {
  beforeEach(() => { vi.clearAllMocks(); findOneAndUpdate.mockResolvedValue(null) })

  it('marks a correctly-paid transaction paid and pending settlement', async () => {
    const t = txn()
    await expect(settle(t, { status: 'success', amount: 1000, fees: 15 })).resolves.toEqual({ applied: true })
    expect(t.status).toBe('paid')
    expect(t.settlementStatus).toBe('pending')
    expect(t.processorFeeAmount).toBe(15)
    expect(t.save).toHaveBeenCalled()
  })

  it('refuses an underpayment instead of crediting the seller in full', async () => {
    // The bug this closes: /verify had no amount check, so a charge the
    // webhook would refuse could be accepted by polling instead.
    const t = txn()
    await expect(settle(t, { status: 'success', amount: 1 }, 'verify'))
      .resolves.toEqual({ applied: false, reason: 'amount_mismatch' })
    expect(t.status).toBe('pending')
    expect(t.save).not.toHaveBeenCalled()
  })

  it('compares against gross MINUS the discount, not gross', async () => {
    const t = txn({ discountAmount: 200 })
    await expect(settle(t, { status: 'success', amount: 800 })).resolves.toEqual({ applied: true })
  })

  it('tolerates a pesewa of provider rounding', async () => {
    const t = txn()
    await expect(settle(t, { status: 'success', amount: 1000.009 })).resolves.toEqual({ applied: true })
  })

  it('refuses anything the provider did not call successful', async () => {
    const t = txn()
    await expect(settle(t, { status: 'failed', amount: 1000 }))
      .resolves.toEqual({ applied: false, reason: 'not_successful' })
    expect(t.status).toBe('pending')
  })

  it('is idempotent — an already-paid transaction is not re-applied', async () => {
    const t = txn({ status: 'paid' })
    await expect(settle(t, { status: 'success', amount: 1000 }))
      .resolves.toEqual({ applied: false, reason: 'already_paid' })
    expect(t.save).not.toHaveBeenCalled()
  })

  it('activates the sponsorship the payment bought', async () => {
    findOneAndUpdate.mockResolvedValue({ _id: 'spon1', status: 'active' })
    const t = txn({ sponsorshipId: 'spon1' })

    await settle(t, { status: 'success', amount: 1000 })

    // Created 'pending_payment' and only 'active' is ever served, so without
    // this a bought campaign could never run.
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'spon1', status: 'pending_payment' },
      { $set: { status: 'active' } },
      { returnDocument: 'after' },
    )
  })

  it('cannot revive a campaign an admin paused — the status guard blocks it', async () => {
    findOneAndUpdate.mockResolvedValue(null)
    const t = txn({ sponsorshipId: 'spon1' })
    await expect(settle(t, { status: 'success', amount: 1000 })).resolves.toEqual({ applied: true })
    expect(findOneAndUpdate.mock.calls[0][0]).toMatchObject({ status: 'pending_payment' })
  })

  it('does not touch sponsorships when the charge is refused', async () => {
    const t = txn({ sponsorshipId: 'spon1' })
    await settle(t, { status: 'success', amount: 5 })
    expect(findOneAndUpdate).not.toHaveBeenCalled()
  })
})

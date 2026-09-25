import { describe, it, expect, vi, beforeEach } from 'vitest'

const findOneAndUpdate = vi.fn()
vi.mock('../models/Sponsorship.js', () => ({ Sponsorship: { findOneAndUpdate } }))

const bookingUpdate = vi.fn()
vi.mock('../models/ServiceBooking.js', () => ({ ServiceBooking: { findOneAndUpdate: bookingUpdate } }))

const txnUpdate = vi.fn()
vi.mock('../models/MarketplaceTransaction.js', () => ({ MarketplaceTransaction: { findOneAndUpdate: txnUpdate } }))

const { applySuccessfulCharge, BINDING_KEY } = await import('../services/marketplace/settle.js')

type Txn = {
  _id: string
  reference: string
  status: string
  currency: string
  grossAmount: number
  discountAmount: number
  platformFeeAmount: number
  providerBound?: boolean
  sponsorshipId?: string
  verifiedAt?: Date
  processorFeeAmount?: number
  settlementStatus?: string
}

const txn = (o: Partial<Txn> = {}): Txn => ({
  _id: 'txn-1',
  reference: 'MKT-1',
  status: 'pending',
  currency: 'GHS',
  grossAmount: 1000,
  discountAmount: 0,
  platformFeeAmount: 50,
  providerBound: true,
  ...o,
})

/** A provider verification of the charge initialized for `t`. */
const charge = (t: Txn, o: Record<string, unknown> = {}) => ({
  status: 'success', amount: t.grossAmount - t.discountAmount, currency: 'GHS', reference: t.reference,
  metadata: { [BINDING_KEY]: t._id }, ...o,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const settle = (t: Txn, v: unknown, s: 'webhook' | 'verify' = 'webhook') => applySuccessfulCharge(t as any, v as any, s)

describe('applying a successful charge (one path for webhook and verify)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findOneAndUpdate.mockResolvedValue(null)
    bookingUpdate.mockResolvedValue(null)
    txnUpdate.mockImplementation(async (_filter, update) => ({ ...update.$set }))
  })

  it('marks a correctly-paid transaction paid and pending settlement, conditionally', async () => {
    const t = txn()
    await expect(settle(t, charge(t, { fees: 15 }))).resolves.toEqual({ applied: true })
    expect(t.status).toBe('paid')
    expect(t.settlementStatus).toBe('pending')
    expect(t.processorFeeAmount).toBe(15)
    // The transition is guarded on the row still awaiting payment, so a
    // webhook and a /verify poll racing each other cannot both settle it.
    expect(txnUpdate).toHaveBeenCalledWith(
      { _id: 'txn-1', status: { $in: ['initialized', 'pending'] } },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'paid' }) }),
      { returnDocument: 'after' },
    )
  })

  it('reports a lost race as already paid and runs no side effects', async () => {
    txnUpdate.mockResolvedValue(null)
    const t = txn({ sponsorshipId: 'spon1' })
    await expect(settle(t, charge(t))).resolves.toEqual({ applied: false, reason: 'already_paid' })
    expect(findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('refuses an underpayment instead of crediting the seller in full', async () => {
    // The bug this closes: /verify had no amount check, so a charge the
    // webhook would refuse could be accepted by polling instead.
    const t = txn()
    await expect(settle(t, charge(t, { amount: 1 }), 'verify'))
      .resolves.toEqual({ applied: false, reason: 'amount_mismatch' })
    expect(t.status).toBe('pending')
    expect(txnUpdate).not.toHaveBeenCalled()
  })

  it('compares against gross MINUS the discount, not gross', async () => {
    const t = txn({ discountAmount: 200 })
    await expect(settle(t, charge(t, { amount: 800 }))).resolves.toEqual({ applied: true })
  })

  it('tolerates a pesewa of provider rounding', async () => {
    const t = txn()
    await expect(settle(t, charge(t, { amount: 1000.009 }))).resolves.toEqual({ applied: true })
  })

  it('refuses anything the provider did not call successful', async () => {
    const t = txn()
    await expect(settle(t, charge(t, { status: 'failed' })))
      .resolves.toEqual({ applied: false, reason: 'not_successful' })
    expect(t.status).toBe('pending')
  })

  it('is idempotent — an already-paid transaction is not re-applied', async () => {
    const t = txn({ status: 'paid' })
    await expect(settle(t, charge(t)))
      .resolves.toEqual({ applied: false, reason: 'already_paid' })
    expect(txnUpdate).not.toHaveBeenCalled()
  })

  it('never settles a failed row, even for a charge that matches it exactly', async () => {
    // The exploit: a client-chosen reference that Paystack had already seen
    // was refused at initialization, the row was kept as failed, and /verify
    // then found the OTHER charge's success and marked the order paid.
    const t = txn({ status: 'failed' })
    await expect(settle(t, charge(t), 'verify')).resolves.toEqual({ applied: false, reason: 'not_settleable' })
    expect(txnUpdate).not.toHaveBeenCalled()
  })

  it('refuses a charge that was not initialized for this transaction', async () => {
    // A wallet deposit of the same amount carries no binding to this order.
    const t = txn()
    await expect(settle(t, charge(t, { metadata: { purpose: 'wallet_deposit' } })))
      .resolves.toEqual({ applied: false, reason: 'binding_mismatch' })
    await expect(settle(t, charge(t, { metadata: { [BINDING_KEY]: 'txn-other' } })))
      .resolves.toEqual({ applied: false, reason: 'binding_mismatch' })
    expect(txnUpdate).not.toHaveBeenCalled()
  })

  it.each([undefined, 'USD', 'NGN', 'ghs'])('refuses a charge taken in %s', async (currency) => {
    const t = txn()
    await expect(settle(t, charge(t, { currency }))).resolves.toEqual({ applied: false, reason: 'currency_mismatch' })
  })

  it('refuses a verification that answers for a different reference', async () => {
    const t = txn()
    await expect(settle(t, charge(t, { reference: 'DEP-123' }))).resolves.toEqual({ applied: false, reason: 'reference_mismatch' })
  })

  it('settles an unbound legacy row only when the reference is one the server generated', async () => {
    const legacy = txn({ providerBound: undefined, reference: 'MKT-1700000000000-ABCD' })
    await expect(settle(legacy, charge(legacy, { metadata: undefined }))).resolves.toEqual({ applied: true })

    const chosen = txn({ providerBound: undefined, reference: 'DEP-1700000000000-ABCD' })
    await expect(settle(chosen, charge(chosen, { metadata: undefined })))
      .resolves.toEqual({ applied: false, reason: 'binding_mismatch' })
  })

  it('activates the sponsorship the payment bought', async () => {
    findOneAndUpdate.mockResolvedValue({ _id: 'spon1', status: 'active' })
    const t = txn({ sponsorshipId: 'spon1' })

    await settle(t, charge(t))

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
    await expect(settle(t, charge(t))).resolves.toEqual({ applied: true })
    expect(findOneAndUpdate.mock.calls[0][0]).toMatchObject({ status: 'pending_payment' })
  })

  it('marks the booking paid so the worker stops chasing a settled payment', async () => {
    bookingUpdate.mockResolvedValue({ _id: 'bk1' })
    const t = txn({ discountAmount: 100 } as Partial<Txn>)
    ;(t as unknown as { bookingId: string }).bookingId = 'bk1'

    await settle(t, charge(t, { amount: 900 }))

    expect(bookingUpdate).toHaveBeenCalledWith(
      { _id: 'bk1', paymentStatus: { $ne: 'paid' } },
      { $set: { paymentStatus: 'paid', paymentAmount: 900 } },
      { returnDocument: 'after' },
    )
  })

  it('does not re-settle a booking already marked paid', async () => {
    bookingUpdate.mockResolvedValue(null)
    const t = txn()
    ;(t as unknown as { bookingId: string }).bookingId = 'bk1'
    await expect(settle(t, charge(t))).resolves.toEqual({ applied: true })
    expect(bookingUpdate.mock.calls[0][0]).toMatchObject({ paymentStatus: { $ne: 'paid' } })
  })

  it('does not touch sponsorships when the charge is refused', async () => {
    const t = txn({ sponsorshipId: 'spon1' })
    await settle(t, charge(t, { amount: 5 }))
    expect(findOneAndUpdate).not.toHaveBeenCalled()
  })
})

import { describe, it, expect } from 'vitest'
import { decideMoneyUpdate, type BookingMoney } from '../services/bookingPricing.js'

const quoted = (o: Partial<BookingMoney> = {}): BookingMoney => ({ quoteAmount: 200, quoteAccepted: false, paymentStatus: 'pending', ...o })
const accepted = (o: Partial<BookingMoney> = {}) => quoted({ quoteAccepted: true, ...o })

describe('service booking price and payment rules', () => {
  it('lets only the customer accept a quote', () => {
    expect(decideMoneyUpdate(quoted(), { quoteAccepted: true }, 'worker')).toMatchObject({ ok: false, status: 403 })
    expect(decideMoneyUpdate(quoted(), { quoteAccepted: true }, 'requester')).toEqual({ ok: true, changes: { quoteAccepted: true } })
    expect(decideMoneyUpdate(quoted({ quoteAmount: undefined }), { quoteAccepted: true }, 'requester')).toMatchObject({ ok: false, status: 409 })
  })

  it('makes a changed quote a new offer that must be accepted again', () => {
    const result = decideMoneyUpdate(accepted({ finalCost: 180 }), { quoteAmount: 350 }, 'worker')
    expect(result).toEqual({ ok: true, changes: { quoteAmount: 350, quoteProvided: true, quoteAccepted: false, finalCost: undefined, proposedFinalCost: undefined } })
  })

  it('lets the worker lower the price after acceptance but only propose a higher one', () => {
    expect(decideMoneyUpdate(accepted(), { finalCost: 150 }, 'worker')).toEqual({ ok: true, changes: { finalCost: 150, proposedFinalCost: undefined } })
    expect(decideMoneyUpdate(accepted(), { finalCost: 900 }, 'worker')).toEqual({ ok: true, changes: { proposedFinalCost: 900 } })
    expect(decideMoneyUpdate(quoted(), { finalCost: 150 }, 'worker')).toMatchObject({ ok: false, status: 409 })
    expect(decideMoneyUpdate(accepted(), { finalCost: 150 }, 'requester')).toMatchObject({ ok: false, status: 403 })
  })

  it('turns a proposal into the price only on the customer\'s approval', () => {
    const pending = accepted({ proposedFinalCost: 900 })
    expect(decideMoneyUpdate(pending, { approveFinalCost: true }, 'worker')).toMatchObject({ ok: false, status: 403 })
    expect(decideMoneyUpdate(pending, { approveFinalCost: true }, 'requester')).toEqual({ ok: true, changes: { finalCost: 900, proposedFinalCost: undefined } })
    expect(decideMoneyUpdate(pending, { approveFinalCost: false }, 'requester')).toEqual({ ok: true, changes: { proposedFinalCost: undefined } })
  })

  it('never takes a payment amount from the customer', () => {
    expect(decideMoneyUpdate(accepted(), { paymentAmount: 1 }, 'requester')).toMatchObject({ ok: false, status: 403 })
    expect(decideMoneyUpdate(accepted(), { paymentStatus: 'paid' }, 'requester')).toMatchObject({ ok: false, status: 403 })
  })

  it('derives the paid amount from the agreed price, whatever the request says', () => {
    expect(decideMoneyUpdate(accepted(), { paymentStatus: 'paid', paymentAmount: 1 }, 'worker'))
      .toEqual({ ok: true, changes: { paymentStatus: 'paid', paymentAmount: 200 } })
    expect(decideMoneyUpdate(accepted({ finalCost: 150 }), { paymentStatus: 'paid' }, 'worker'))
      .toEqual({ ok: true, changes: { paymentStatus: 'paid', paymentAmount: 150 } })
  })

  it('accepts a reported partial payment only below the agreed price', () => {
    expect(decideMoneyUpdate(accepted(), { paymentStatus: 'partial', paymentAmount: 50 }, 'worker'))
      .toEqual({ ok: true, changes: { paymentStatus: 'partial', paymentAmount: 50 } })
    expect(decideMoneyUpdate(accepted(), { paymentStatus: 'partial', paymentAmount: 200 }, 'worker')).toMatchObject({ ok: false, status: 400 })
    expect(decideMoneyUpdate(accepted(), { paymentAmount: 50 }, 'worker')).toMatchObject({ ok: false, status: 409 })
  })

  it('locks the price once paid, except for an admin settling a dispute', () => {
    const paid = accepted({ paymentStatus: 'paid', paymentAmount: 200 })
    expect(decideMoneyUpdate(paid, { finalCost: 100 }, 'worker')).toMatchObject({ ok: false, status: 409 })
    expect(decideMoneyUpdate(paid, { quoteAmount: 500 }, 'worker')).toMatchObject({ ok: false, status: 409 })
    expect(decideMoneyUpdate(paid, { finalCost: 100 }, 'admin')).toMatchObject({ ok: true })
  })
})

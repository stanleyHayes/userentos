/**
 * Who may change a service booking's price and payment fields, and how.
 *
 * The price a buyer is charged at checkout is `finalCost ?? quoteAmount` once
 * the quote is accepted (services/marketplace/pricing.ts), so these fields are
 * money. They were loosely guarded: the worker could accept their own quote,
 * raise finalCost after the customer accepted a lower one, and the customer
 * could write paymentAmount. The rules now:
 *
 *  - only the worker quotes, and a changed quote must be accepted again;
 *  - only the customer accepts a quote;
 *  - after acceptance the worker may lower the price, but a higher finalCost
 *    is only a proposal until the customer approves it;
 *  - paymentAmount is derived from the agreed price when the worker (the
 *    payee) marks the job paid; only a partial payment is reported by hand,
 *    and never by the customer;
 *  - once paid, the price is locked. Admins may override, to settle disputes.
 */
export type BookingActor = 'requester' | 'worker' | 'admin'

export interface BookingMoney {
  quoteAmount?: number
  quoteAccepted: boolean
  finalCost?: number
  proposedFinalCost?: number
  paymentStatus: 'pending' | 'partial' | 'paid'
  paymentAmount?: number
}

export interface BookingMoneyInput {
  quoteAmount?: number
  quoteAccepted?: boolean
  finalCost?: number
  approveFinalCost?: boolean
  paymentStatus?: 'pending' | 'partial' | 'paid'
  paymentAmount?: number
}

export type BookingMoneyChanges = Partial<Record<keyof BookingMoney, unknown>> & { quoteProvided?: boolean }

export type MoneyDecision =
  | { ok: true; changes: BookingMoneyChanges }
  | { ok: false; status: number; message: string }

const EPSILON = 0.009
const round2 = (n: number) => Math.round(n * 100) / 100
const refuse = (status: number, message: string): MoneyDecision => ({ ok: false, status, message })

export function decideMoneyUpdate(current: BookingMoney, input: BookingMoneyInput, actor: BookingActor): MoneyDecision {
  const changes: BookingMoneyChanges = {}
  const isAdmin = actor === 'admin'
  const touchesPrice = input.quoteAmount !== undefined || input.quoteAccepted !== undefined
    || input.finalCost !== undefined || input.approveFinalCost !== undefined

  if (touchesPrice && current.paymentStatus === 'paid' && !isAdmin) {
    return refuse(409, 'This booking is paid; its price can no longer change.')
  }

  if (input.quoteAmount !== undefined) {
    if (actor === 'requester') return refuse(403, 'Only the worker can provide a quote')
    const amount = round2(input.quoteAmount)
    changes.quoteAmount = amount
    changes.quoteProvided = true
    // A different figure is a new offer: whatever was accepted, or agreed on
    // top of it, belonged to the old one.
    if (current.quoteAccepted && amount !== current.quoteAmount) {
      changes.quoteAccepted = false
      changes.finalCost = undefined
      changes.proposedFinalCost = undefined
    }
  }

  if (input.quoteAccepted !== undefined) {
    if (actor === 'worker') return refuse(403, 'Only the customer can accept a quote')
    const quote = (changes.quoteAmount ?? current.quoteAmount) as number | undefined
    if (input.quoteAccepted && !quote) return refuse(409, 'There is no quote to accept yet')
    changes.quoteAccepted = input.quoteAccepted
  }

  const quote = (changes.quoteAmount ?? current.quoteAmount) as number | undefined
  const accepted = (changes.quoteAccepted ?? current.quoteAccepted) as boolean

  if (input.finalCost !== undefined) {
    if (actor === 'requester') return refuse(403, 'Only the worker can set the final cost')
    const cost = round2(input.finalCost)
    if (isAdmin) {
      changes.finalCost = cost
      changes.proposedFinalCost = undefined
    } else if (!accepted || quote === undefined) {
      return refuse(409, 'The customer has not accepted a quote yet')
    } else if (cost <= quote + EPSILON) {
      changes.finalCost = cost
      changes.proposedFinalCost = undefined
    } else {
      // More than the customer agreed to: theirs to approve, not the worker's to set.
      changes.proposedFinalCost = cost
    }
  }

  if (input.approveFinalCost !== undefined) {
    if (actor === 'worker') return refuse(403, 'Only the customer can approve a new final cost')
    if (current.proposedFinalCost === undefined) return refuse(409, 'There is no proposed final cost to approve')
    if (input.approveFinalCost) changes.finalCost = current.proposedFinalCost
    changes.proposedFinalCost = undefined
  }

  const agreed = (('finalCost' in changes ? changes.finalCost : current.finalCost) as number | undefined) ?? quote
  const nextStatus = input.paymentStatus ?? current.paymentStatus

  if (input.paymentStatus !== undefined || input.paymentAmount !== undefined) {
    if (actor === 'requester') return refuse(403, 'Only the worker can update payment status')
  }
  if (input.paymentStatus !== undefined) changes.paymentStatus = input.paymentStatus

  if (nextStatus === 'paid' && input.paymentStatus === 'paid') {
    // Paid means paid the agreed price, whatever figure came with the request.
    changes.paymentAmount = agreed
  } else if (nextStatus === 'pending' && input.paymentStatus === 'pending') {
    changes.paymentAmount = undefined
  } else if (input.paymentAmount !== undefined || input.paymentStatus === 'partial') {
    if (nextStatus !== 'partial') return refuse(409, 'A payment amount can only be reported for a partial payment')
    if (input.paymentAmount === undefined) return refuse(400, 'Report how much was paid')
    const amount = round2(input.paymentAmount)
    if (amount <= 0) return refuse(400, 'A partial payment must be more than zero')
    if (agreed !== undefined && amount >= agreed - EPSILON) return refuse(400, 'A partial payment must be less than the agreed cost')
    changes.paymentAmount = amount
  }

  return { ok: true, changes }
}

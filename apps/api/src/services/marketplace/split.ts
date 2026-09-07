/**
 * Split calculation for marketplace payments (spec §8.2).
 *
 * Paystack's model, confirmed against their documentation: a subaccount's
 * `percentage_charge` is the share that stays with the MAIN account — "20%
 * going to main account and the rest going to subaccount". So RentOS's
 * platform fee percent maps directly onto percentage_charge, and the seller
 * receives the remainder.
 *
 * The platform fee and the processor fee are different things. Paystack's own
 * charge is governed separately by `bearer`, which is recorded on every
 * transaction rather than assumed.
 */
import { round2 } from '../../utils/money.js'

export interface SplitInput {
  grossAmount: number
  platformFeePercent: number
  discountAmount?: number
  feeBearer?: 'platform' | 'seller'
}

export interface SplitResult {
  grossAmount: number
  /** What the buyer actually pays after any discount. */
  payableAmount: number
  platformFeePercent: number
  platformFeeAmount: number
  sellerExpectedAmount: number
  discountAmount: number
  feeBearer: 'platform' | 'seller'
}

export function calculateSplit(input: SplitInput): SplitResult {
  const gross = round2(Math.max(0, input.grossAmount))
  const discount = round2(Math.min(Math.max(0, input.discountAmount ?? 0), gross))

  // A coupon may never make the payable amount negative (spec §10).
  const payable = round2(gross - discount)

  const percent = Math.min(100, Math.max(0, input.platformFeePercent))
  const platformFee = round2((payable * percent) / 100)
  const sellerShare = round2(payable - platformFee)

  return {
    grossAmount: gross,
    payableAmount: payable,
    platformFeePercent: percent,
    platformFeeAmount: platformFee,
    sellerExpectedAmount: sellerShare,
    discountAmount: discount,
    feeBearer: input.feeBearer ?? 'platform',
  }
}

/** GHS major units -> pesewas, which is what Paystack expects on the wire. */
export function toMinorUnits(amount: number): number {
  return Math.round(round2(amount) * 100)
}

export function fromMinorUnits(amount: number): number {
  return round2(Math.round(amount) / 100)
}

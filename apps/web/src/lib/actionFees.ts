/**
 * The GH₵5 pay-per-action fees (product brief §08; apps/api/src/services/actionFees.ts):
 * signing and downloading an agreement (once per agreement) and exporting the
 * rental passport (per export). Viewing is always free. The API answers 402
 * with the price when a fee is due.
 */
export interface FeeQuote {
  purpose: 'agreement_fee' | 'passport_export'
  amount: number
  currency: 'GHS'
  label: string
}

/** The fee a request was refused for, or null if it was refused for another reason. */
export function feeRequired(err: unknown): FeeQuote | null {
  const e = err as { status?: number; fee?: FeeQuote } | null
  return e?.status === 402 && e.fee ? e.fee : null
}

export interface FeePayment {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded'
  reference?: string
}

/** A payment of ours already under way (409 PAYMENT_IN_PROGRESS), to keep waiting on. */
export function paymentInProgress(err: unknown): FeePayment | null {
  const e = err as { status?: number; code?: string; data?: { payment?: FeePayment } } | null
  return e?.status === 409 && e.code === 'PAYMENT_IN_PROGRESS' && e.data?.payment ? e.data.payment : null
}

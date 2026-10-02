/**
 * Pay-per-action fees (product brief §08), separate from the monthly plan:
 *
 * - Agreement signing and export, GH₵5 once per agreement. Viewing stays free;
 *   the tenant pays when about to sign, and that one payment unlocks signing
 *   and the PDF for both parties.
 * - Passport export, GH₵5 per export (a PDF download or a share link). Viewing
 *   the passport stays free.
 *
 * Each fee is off until an admin enables its feature flag, and even then only
 * charged when a real payment provider is configured: nobody is ever blocked
 * behind a payment the platform cannot take. Agreements created while the fee
 * was off are never charged (grandfathered at creation).
 *
 * Kept free of payment-provider imports: the Agreement model reads it.
 */
import mongoose from 'mongoose'
import { isEnabled } from './featureFlags.js'
import { envOptional, envOr } from '../utils/env.js'
import { logger } from '../utils/logger.js'

export const ACTION_FEES = {
  agreement_fee: { amount: 5, flag: 'fees.agreement_signing', label: 'Agreement signing and download', referencePrefix: 'AGR' },
  passport_export: { amount: 5, flag: 'fees.passport_export', label: 'Rental passport export', referencePrefix: 'PSP' },
} as const

export type ActionFeePurpose = keyof typeof ACTION_FEES

/** One paid passport export may be retried (a failed download, a second link) for this long. */
export const PASSPORT_EXPORT_WINDOW_MS = 30 * 60 * 1000

/**
 * Can the platform take a payment right now? Simulated payments count only
 * where payments.getMode() would allow them; live mobile money needs Paystack.
 * Mirrors services/payments/index.ts without importing it.
 */
export function feePaymentsReady(): boolean {
  const mode = process.env.PAYMENTS_PROVIDER_MODE
  const production = process.env.NODE_ENV === 'production'
  if (mode === 'simulated') return !production || process.env.ALLOW_SIMULATED_PAYMENTS === 'true'
  if (mode === 'live') return envOr('PAYMENTS_RAIL', 'paystack') === 'direct' || !!envOptional('PAYSTACK_SECRET_KEY')
  return !production
}

/** Is this fee being charged right now? */
export async function feeActive(purpose: ActionFeePurpose): Promise<boolean> {
  if (mongoose.connection.readyState !== 1 || !feePaymentsReady()) return false
  try {
    return await isEnabled(ACTION_FEES[purpose].flag, {})
  } catch (err) {
    logger.warn(`[actionFees] flag lookup failed: ${(err as Error).message}`)
    return false
  }
}

export interface FeeQuote {
  purpose: ActionFeePurpose
  amount: number
  currency: 'GHS'
  label: string
}

export const feeQuote = (purpose: ActionFeePurpose): FeeQuote => ({ purpose, amount: ACTION_FEES[purpose].amount, currency: 'GHS', label: ACTION_FEES[purpose].label })

type FeeAgreement = { signingFeeRequired?: boolean; signingFeePaidAt?: Date | null }

/** Does this agreement still need its signing fee before anyone signs or downloads it as the tenant? */
export async function agreementFeeDue(agreement: FeeAgreement): Promise<boolean> {
  if (!agreement.signingFeeRequired || agreement.signingFeePaidAt) return false
  return feeActive('agreement_fee')
}

/** The 402 body a client turns into "Pay GH₵5 to …". */
export function feeRequiredBody(purpose: ActionFeePurpose, message: string) {
  return { success: false, error: message, code: purpose === 'agreement_fee' ? 'AGREEMENT_FEE_REQUIRED' : 'PASSPORT_EXPORT_FEE_REQUIRED', fee: feeQuote(purpose) }
}

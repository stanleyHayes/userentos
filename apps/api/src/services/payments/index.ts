/**
 * Payment provider factory.
 *
 * Reads `PAYMENTS_PROVIDER_MODE` (`'live' | 'simulated'`, default `simulated`).
 * Returns the live adapter for the requested method when in live mode, or the
 * simulator adapter (which preserves legacy auto-complete behavior) otherwise.
 *
 * Centralizing the toggle here means the controller and webhook routes never
 * branch on the mode — they just call `getProvider(method).initiateCollection(...)`
 * and the right thing happens for the current environment.
 */

import type { PaymentProvider, ProviderId } from './types.js'
import { mtnMomoProvider } from './mtnMomo.js'
import { telecelCashProvider } from './telecelCash.js'
import { airtelTigoMoneyProvider } from './airteltigoMoney.js'
import { bankTransferProvider } from './bankTransfer.js'
import { makeSimulator } from './simulator.js'

export type PaymentMode = 'live' | 'simulated'

export function getMode(): PaymentMode {
  const raw = process.env.PAYMENTS_PROVIDER_MODE
  if (raw === 'live') return 'live'
  if (raw === 'simulated') {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[Payments] WARNING: PAYMENTS_PROVIDER_MODE=simulated in production — no real funds will move!')
    }
    return 'simulated'
  }
  // Unset/invalid: refuse to guess in production — a deploy missing this env var
  // must fail loudly, not silently auto-complete every payment.
  if (process.env.NODE_ENV === 'production') {
    throw new Error("PAYMENTS_PROVIDER_MODE must be explicitly set to 'live' or 'simulated' in production")
  }
  console.warn('[Payments] PAYMENTS_PROVIDER_MODE unset — defaulting to simulated (dev mode)')
  return 'simulated'
}

const liveProviders: Record<ProviderId, PaymentProvider> = {
  mtn_momo: mtnMomoProvider,
  telecel_cash: telecelCashProvider,
  airteltigo_money: airtelTigoMoneyProvider,
  bank_transfer: bankTransferProvider,
}

export function getProvider(method: ProviderId): PaymentProvider {
  if (getMode() === 'live') return liveProviders[method]
  return makeSimulator(method)
}

export type { PaymentProvider, ProviderId } from './types.js'
export { onSimulatedComplete } from './simulator.js'

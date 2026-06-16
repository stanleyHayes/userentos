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
  return process.env.PAYMENTS_PROVIDER_MODE === 'live' ? 'live' : 'simulated'
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

/**
 * Payment provider factory.
 *
 * Two independent switches:
 *
 *  - `PAYMENTS_PROVIDER_MODE` (`'live' | 'simulated'`) decides whether real
 *    money moves at all.
 *  - `PAYMENTS_RAIL` (`'paystack' | 'direct'`) decides WHO carries a live
 *    mobile-money collection: Paystack, which already fronts MTN, Telecel and
 *    AirtelTigo for the marketplace side, or the three direct telco
 *    integrations, each of which needs its own commercial contract.
 *
 * Paystack is the default rail because it is the one relationship the platform
 * actually has. `direct` is kept so the telco adapters remain reachable for
 * anyone who does sign those contracts.
 *
 * Centralizing both here means the controller and webhook routes never branch —
 * they call `getProvider(method).initiateCollection(...)` and the right thing
 * happens for the current environment.
 */

import type { PaymentProvider, ProviderId } from './types.js'
import { mtnMomoProvider } from './mtnMomo.js'
import { telecelCashProvider } from './telecelCash.js'
import { airtelTigoMoneyProvider } from './airteltigoMoney.js'
import { bankTransferProvider } from './bankTransfer.js'
import { makeSimulator } from './simulator.js'
import { paystackRentProviders } from './paystackRent.js'
import { envOr } from '../../utils/env.js'

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

/** The direct telco/bank integrations, one contract per network. */
const directProviders: Record<ProviderId, PaymentProvider> = {
  mtn_momo: mtnMomoProvider,
  telecel_cash: telecelCashProvider,
  airteltigo_money: airtelTigoMoneyProvider,
  bank_transfer: bankTransferProvider,
}

export type PaymentRail = 'paystack' | 'direct'

export function getRail(): PaymentRail {
  return envOr('PAYMENTS_RAIL', 'paystack') === 'direct' ? 'direct' : 'paystack'
}

/**
 * Bank transfer has no Paystack equivalent in this flow, so it always uses its
 * own adapter regardless of rail — a caller asking for a bank collection gets
 * one rather than a confusing failure.
 */
export function getProvider(method: ProviderId): PaymentProvider {
  if (getMode() !== 'live') return makeSimulator(method)
  if (getRail() === 'paystack' && method !== 'bank_transfer') {
    return paystackRentProviders[method]
  }
  return directProviders[method]
}

export type { PaymentProvider, ProviderId } from './types.js'
export { onSimulatedComplete } from './simulator.js'

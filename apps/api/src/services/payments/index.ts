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
import { envOptional, envOr } from '../../utils/env.js'

export type PaymentMode = 'live' | 'simulated'

/**
 * Whether a rail is usable in LIVE mode.
 *
 * Bank transfer is "pay by reference": the payer is shown a deposit account
 * number and sends money to it from their banking app. With
 * BANK_DEPOSIT_ACCOUNT unset the adapter falls back to `0000000000` at
 * "Stanbic Bank Ghana", so a tenant who picked Bank Transfer — it is offered
 * in the UI today — was told to transfer real rent to a placeholder account,
 * and the money would be gone with no webhook ever arriving.
 *
 * The fallback is right for a demo and wrong for production, so the rail is
 * gated on being configured rather than on the default being plausible.
 * Mobile money needs no gate: it rides Paystack, which is configured.
 */
export function isMethodAvailable(method: ProviderId): boolean {
  if (getMode() !== 'live') return true
  if (method === 'bank_transfer') {
    return !!envOptional('BANK_DEPOSIT_ACCOUNT') && !!envOptional('BANK_PSP_WEBHOOK_SECRET')
  }
  return true
}

/**
 * Warn when live mode is running on a Paystack TEST key.
 *
 * `PAYMENTS_PROVIDER_MODE=live` with `sk_test_` is a real integration against
 * Paystack's test environment — the webhook flow, the signature check and
 * settlement all exercise the production code path. That is exactly right for
 * staging, and it is the single most dangerous configuration to reach real
 * tenants: charges "succeed", the platform marks rent paid, and no money has
 * moved. The difference is one character in an env var, so it should never be
 * silent.
 *
 * Called once at boot.
 */
export function warnOnTestKeyInLiveMode(): void {
  if (getMode() !== 'live') return
  const key = envOptional('PAYSTACK_SECRET_KEY') ?? ''
  if (!key) {
    console.warn('[Payments] WARNING: live mode with no PAYSTACK_SECRET_KEY — every collection will fail.')
    return
  }
  if (key.startsWith('sk_test_')) {
    console.warn(
      '[Payments] WARNING: live mode is using a Paystack TEST key (sk_test_). '
      + 'Charges will appear to succeed and NO REAL MONEY WILL MOVE. '
      + 'Fine for staging; swap in sk_live_ before real tenants pay.',
    )
  }
}

/** The rails a payer may actually choose right now. */
export function availableMethods(): ProviderId[] {
  return (['mtn_momo', 'telecel_cash', 'airteltigo_money', 'bank_transfer'] as ProviderId[])
    .filter(isMethodAvailable)
}

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

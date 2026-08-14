/**
 * Payout provider selection.
 *
 * Reads `PAYMENTS_PROVIDER_MODE` — the same switch that governs collections, so
 * a deployment can never be live on the way in and simulated on the way out.
 * `PAYOUT_PROVIDER` picks which PSP handles the live path.
 */

import { paystackPayoutProvider } from './paystack.js'
import { simulatedPayoutProvider } from './simulator.js'
import type { PayoutProvider } from './types.js'

const liveProviders: Record<string, PayoutProvider> = {
  paystack: paystackPayoutProvider,
}

export function getPayoutProvider(): PayoutProvider {
  if (process.env.PAYMENTS_PROVIDER_MODE !== 'live') return simulatedPayoutProvider

  const name = process.env.PAYOUT_PROVIDER ?? 'paystack'
  const provider = liveProviders[name]
  if (!provider) {
    throw new Error(`Unknown PAYOUT_PROVIDER '${name}' — supported: ${Object.keys(liveProviders).join(', ')}`)
  }
  return provider
}

/** True when payouts would move real money. */
export function payoutsAreLive(): boolean {
  return process.env.PAYMENTS_PROVIDER_MODE === 'live'
}

export type {
  PayoutProvider,
  PayoutDestination,
  RecipientInput,
  TransferInput,
  PayoutWebhookEvent,
} from './types.js'
export { onSimulatedPayout } from './simulator.js'

/**
 * Simulated payout adapter — lets the whole payout flow (request → approve →
 * webhook → paid) run in dev and tests without PSP credentials or real money.
 *
 * Mirrors `services/payments/simulator.ts`: after a transfer is accepted it
 * schedules a deferred completion that the payout route wires to the same
 * finalize path a real webhook uses, so nothing downstream is bypassed.
 */

import type {
  PayoutProvider,
  RecipientInput,
  RecipientResult,
  TransferInput,
  TransferResult,
  PayoutWebhookEvent,
  PayoutDestination,
} from './types.js'

type Listener = (event: PayoutWebhookEvent) => void
const listeners = new Set<Listener>()

/** Subscribe to simulated payout completions. */
export function onSimulatedPayout(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit(event: PayoutWebhookEvent) {
  for (const fn of listeners) {
    try {
      fn(event)
    } catch (err) {
      console.warn('[PayoutSimulator] listener threw:', (err as Error).message)
    }
  }
}

const SIMULATED_DESTINATIONS: PayoutDestination[] = [
  { name: 'MTN Mobile Money', code: 'MTN', type: 'mobile_money' },
  { name: 'Telecel Cash', code: 'VOD', type: 'mobile_money' },
  { name: 'AirtelTigo Money', code: 'ATL', type: 'mobile_money' },
  { name: 'Stanbic Bank Ghana', code: '190100', type: 'ghipss' },
  { name: 'GCB Bank', code: '040100', type: 'ghipss' },
]

export const simulatedPayoutProvider: PayoutProvider = {
  id: 'simulated',

  async listDestinations() {
    return SIMULATED_DESTINATIONS
  },

  async createRecipient(input: RecipientInput): Promise<RecipientResult> {
    return {
      recipientCode: `SIM-RCP-${input.accountNumber.slice(-4)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      accountName: input.name,
    }
  },

  async sendTransfer(input: TransferInput): Promise<TransferResult> {
    const providerRef = `SIM-TRF-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

    setTimeout(() => {
      emit({
        reference: input.reference,
        providerRef,
        status: 'paid',
        amount: input.amount,
        timestamp: new Date().toISOString(),
        raw: { simulated: true, reason: input.reason },
      })
    }, 2000)

    return { providerRef, status: 'pending' }
  },

  verifyWebhook(): boolean {
    // Simulated events are dispatched in-process, never over HTTP.
    return true
  },

  parseWebhook(rawBody: string): PayoutWebhookEvent {
    const data = JSON.parse(rawBody)
    return {
      reference: data.reference,
      providerRef: data.providerRef,
      status: data.status ?? 'paid',
      amount: Number(data.amount ?? 0),
      timestamp: data.timestamp ?? new Date().toISOString(),
      failureReason: data.failureReason,
      raw: data,
    }
  },
}

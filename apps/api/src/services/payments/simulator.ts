/**
 * Simulator adapter — preserves the legacy `setTimeout` behavior so dev,
 * seeds, and tests work without provider creds.
 *
 * After `initiateCollection`, schedules a deferred webhook-style callback
 * (`onSimulatedComplete`) that the controller wires up to the same finalize
 * path used by real webhooks. This means everything downstream of webhook
 * processing (achievements, notifications, streaks) runs in dev too.
 */

import type {
  PaymentProvider,
  CollectionInput,
  InitiateResult,
  WebhookEvent,
  ProviderStatus,
  ProviderId,
} from './types.js'

type Listener = (event: WebhookEvent) => void
const listeners = new Set<Listener>()

/** Subscribe to simulated completion events. The controller wires this to the same path as a real webhook. */
export function onSimulatedComplete(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit(event: WebhookEvent) {
  for (const fn of listeners) {
    try {
      fn(event)
    } catch (err) {
      console.warn('[Simulator] listener threw:', (err as Error).message)
    }
  }
}

class SimulatorProvider implements PaymentProvider {
  id: ProviderId
  constructor(id: ProviderId) {
    this.id = id
  }

  async initiateCollection(input: CollectionInput): Promise<InitiateResult> {
    const providerRef = `SIM-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    // Auto-complete after 2s (legacy behavior)
    setTimeout(() => {
      emit({
        reference: input.reference,
        providerRef,
        status: 'completed',
        amount: input.amount,
        timestamp: new Date().toISOString(),
        raw: { simulated: true, providerId: this.id, narration: input.narration },
      })
    }, 2000)

    return {
      providerRef,
      status: 'pending',
      instructions: `Simulated ${this.id.replace('_', ' ')} payment — auto-completing in 2 seconds (development mode).`,
    }
  }

  verifyWebhook(_rawBody: string, _headers: Record<string, string>): boolean {
    // Simulator events bypass HTTP and are dispatched directly.
    return true
  }

  parseWebhook(rawBody: string): WebhookEvent {
    const data = JSON.parse(rawBody)
    return {
      reference: data.reference,
      providerRef: data.providerRef,
      status: (data.status ?? 'completed') as ProviderStatus,
      amount: Number(data.amount ?? 0),
      timestamp: data.timestamp ?? new Date().toISOString(),
      raw: data,
    }
  }

  async queryStatus(providerRef: string): Promise<ProviderStatus> {
    // In simulator mode, anything that hasn't fired yet is still pending.
    // The async setTimeout above will mark it completed via the listener path.
    return providerRef.startsWith('SIM-') ? 'pending' : 'completed'
  }
}

export function makeSimulator(id: ProviderId): PaymentProvider {
  return new SimulatorProvider(id)
}

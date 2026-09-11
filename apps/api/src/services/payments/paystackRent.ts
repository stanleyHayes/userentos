/**
 * Paystack as the collection rail for rent, savings and subscription payments.
 *
 * Until now this flow could ONLY be served by direct telco integrations
 * (MTN MoMo, Telecel Cash, AirtelTigo Money), each needing its own commercial
 * contract and credentials. Paystack already fronts all three networks for the
 * marketplace side, so one adapter replaces three integrations and the platform
 * needs one relationship instead of four.
 *
 * Deliberately NOT a new ProviderId. A tenant still chooses "MTN MoMo" and the
 * charge still lands on their MTN wallet — only who carries it changes. That
 * keeps every existing Payment row, UI label and report valid, and means
 * switching rails is a config change rather than a migration.
 *
 * Provider codes were confirmed against the live test API rather than recalled:
 * mtn, vod, tgo and atl are accepted (case-insensitively); "airtel" and
 * "telecel" are rejected. Telecel Cash maps to `vod` because Paystack still
 * uses Vodafone Ghana's original code after the rebrand.
 */
import { createHmac, timingSafeEqual } from 'crypto'
import { envOr } from '../../utils/env.js'
import { logger } from '../../utils/logger.js'
import { toMinorUnits } from '../marketplace/split.js'
import type {
  CollectionInput,
  InitiateResult,
  PaymentProvider,
  ProviderId,
  ProviderStatus,
  WebhookEvent,
} from './types.js'

const BASE_URL = envOr('PAYSTACK_BASE_URL', 'https://api.paystack.co')
const REQUEST_TIMEOUT_MS = 20_000

/** Which Paystack mobile-money code carries each of our provider ids. */
const PAYSTACK_PROVIDER: Record<Exclude<ProviderId, 'bank_transfer'>, string> = {
  mtn_momo: 'mtn',
  telecel_cash: 'vod',
  airteltigo_money: 'atl',
}

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) throw new Error('PAYSTACK_SECRET_KEY is not set — Paystack collections cannot run')
  return key
}

/**
 * Paystack wants a local Ghanaian number (0XXXXXXXXX).
 *
 * Our CollectionInput carries MSISDN (233XXXXXXXXX). The API tolerates both
 * today, but normalising means one shape reaches the provider regardless of
 * where the number came from — a profile, a form, or a seed.
 */
export function toLocalGhanaMsisdn(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '')
  if (digits.startsWith('233')) return `0${digits.slice(3)}`
  if (digits.startsWith('0')) return digits
  // A bare 9-digit subscriber number, e.g. 551234987.
  if (digits.length === 9) return `0${digits}`
  return digits
}

interface Envelope<T> { status: boolean; message: string; data: T }

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: init?.method ?? 'GET',
    headers: { authorization: `Bearer ${secretKey()}`, 'content-type': 'application/json' },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  const text = await res.text()
  let payload: Envelope<T>
  try {
    payload = JSON.parse(text) as Envelope<T>
  } catch {
    throw new Error(`Paystack ${path} returned non-JSON (${res.status}): ${text.slice(0, 200)}`)
  }
  if (!res.ok || payload.status === false) {
    throw new Error(`Paystack ${path} failed (${res.status}): ${payload.message || text.slice(0, 200)}`)
  }
  return payload.data
}

/**
 * Map Paystack's charge status onto ours.
 *
 * Everything that is not definitively finished stays `pending`: send_otp,
 * pay_offline and open_url all mean the payer still has a step to take, and
 * calling any of them `failed` would cancel a payment the tenant is midway
 * through approving on their handset.
 */
export function mapChargeStatus(status: string | undefined): ProviderStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'success':
      return 'completed'
    case 'failed':
    case 'reversed':
    case 'abandoned':
      return 'failed'
    default:
      return 'pending'
  }
}

/** The next step to show the payer, in their words rather than Paystack's. */
function instructionFor(status: string | undefined, display?: string): string | undefined {
  if (display) return display
  switch ((status ?? '').toLowerCase()) {
    case 'send_otp':
      return 'Enter the one-time code sent to your phone.'
    case 'pay_offline':
      return 'Approve the prompt on your phone to complete the payment.'
    case 'pending':
      return 'Waiting for you to approve the payment on your phone.'
    case 'success':
      return undefined
    default:
      return 'Follow the prompt on your phone to complete the payment.'
  }
}

interface ChargeResponse {
  reference: string
  status: string
  display_text?: string
  message?: string
}

interface PaystackChargeEvent {
  event?: string
  data?: {
    reference?: string
    id?: number | string
    status?: string
    amount?: number
    paid_at?: string
    created_at?: string
  }
}

/**
 * One adapter instance per provider id, so `getProvider('mtn_momo')` keeps
 * returning something whose `id` is `mtn_momo` — callers and stored Payment
 * rows never learn that Paystack is underneath.
 */
function makePaystackProvider(id: Exclude<ProviderId, 'bank_transfer'>): PaymentProvider {
  return {
    id,

    async initiateCollection(input: CollectionInput): Promise<InitiateResult> {
      const data = await call<ChargeResponse>('/charge', {
        method: 'POST',
        body: {
          // Paystack requires an email; it is the payer's receipt address and
          // is not otherwise used by this flow.
          email: envOr('PAYSTACK_COLLECTION_EMAIL', 'payments@userentos.com'),
          amount: String(toMinorUnits(input.amount)),
          currency: 'GHS',
          reference: input.reference,
          mobile_money: {
            phone: toLocalGhanaMsisdn(input.phone),
            provider: PAYSTACK_PROVIDER[id],
          },
          metadata: { narration: input.narration, rentos_reference: input.reference },
        },
      })

      return {
        // Paystack echoes our reference; keep its own id only if it differs.
        providerRef: data.reference || input.reference,
        status: mapChargeStatus(data.status),
        instructions: instructionFor(data.status, data.display_text),
      }
    },

    verifyWebhook(rawBody: string, headers: Record<string, string>): boolean {
      const signature = headers['x-paystack-signature'] ?? headers['X-Paystack-Signature']
      if (!signature) return false
      let expected: string
      try {
        // Hex HMAC-SHA512 over the RAW body, keyed with the secret key.
        expected = createHmac('sha512', secretKey()).update(rawBody, 'utf8').digest('hex')
      } catch {
        return false
      }
      const a = Buffer.from(signature, 'utf8')
      const b = Buffer.from(expected, 'utf8')
      // timingSafeEqual throws on a length mismatch, so check length first.
      if (a.length !== b.length) return false
      return timingSafeEqual(a, b)
    },

    parseWebhook(rawBody: string): WebhookEvent {
      const event = JSON.parse(rawBody) as PaystackChargeEvent
      const data = event.data ?? {}
      return {
        reference: data.reference ?? '',
        providerRef: String(data.id ?? data.reference ?? ''),
        // charge.success is the only event that moves money; anything else
        // that reaches here is reported by its own status.
        status: event.event === 'charge.success' ? 'completed' : mapChargeStatus(data.status),
        // Paystack speaks pesewas on the wire; our domain speaks cedis.
        amount: typeof data.amount === 'number' ? data.amount / 100 : 0,
        timestamp: data.paid_at ?? data.created_at ?? new Date().toISOString(),
        raw: event,
      }
    },

    async queryStatus(providerRef: string): Promise<ProviderStatus> {
      try {
        const data = await call<{ status: string }>(`/transaction/verify/${encodeURIComponent(providerRef)}`)
        return mapChargeStatus(data.status)
      } catch (err) {
        // Reconciliation must not throw: an unreachable provider means "still
        // unknown", not "failed", or the sweep would cancel live payments.
        logger.warn(`[paystack-rent] verify ${providerRef} failed: ${(err as Error).message}`)
        return 'pending'
      }
    },
  }
}

export const paystackMtnProvider = makePaystackProvider('mtn_momo')
export const paystackTelecelProvider = makePaystackProvider('telecel_cash')
export const paystackAirtelTigoProvider = makePaystackProvider('airteltigo_money')

export const paystackRentProviders: Record<Exclude<ProviderId, 'bank_transfer'>, PaymentProvider> = {
  mtn_momo: paystackMtnProvider,
  telecel_cash: paystackTelecelProvider,
  airteltigo_money: paystackAirtelTigoProvider,
}

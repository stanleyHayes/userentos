/**
 * Paystack payout adapter — Transfers API.
 *
 * Reference: https://paystack.com/docs/transfers/single-transfers/
 *
 * Flow:
 *   1. GET  {base}/bank?country=ghana&currency=GHS[&type=mobile_money]
 *      → the telco / bank codes the account-setup form offers.
 *   2. POST {base}/transferrecipient
 *      { type: 'mobile_money' | 'ghipss', name, account_number, bank_code,
 *        currency: 'GHS' }
 *      → data.recipient_code (RCP_xxx) and the resolved data.details.account_name.
 *   3. POST {base}/transfer
 *      { source: 'balance', amount, recipient, reference, reason }
 *      → data.transfer_code (TRF_xxx), status usually 'pending'/'otp'.
 *   4. Paystack POSTs `transfer.success` / `transfer.failed` /
 *      `transfer.reversed` to the webhook URL.
 *
 * Auth is a single secret key (Bearer). Webhooks carry `x-paystack-signature`:
 * a hex HMAC-SHA512 of the RAW body keyed with that same secret key.
 *
 * Amounts cross the wire in minor units (pesewas), so GHS 250.00 → 25000.
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { envOr } from '../../utils/env.js'
import { TransferRejectedError } from './types.js'
import type {
  PayoutProvider,
  RecipientInput,
  RecipientResult,
  TransferInput,
  TransferResult,
  TransferLookup,
  PayoutWebhookEvent,
  PayoutDestination,
} from './types.js'

/** Paystack answered, with a JSON body, and said no. */
class PaystackHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

const BASE_URL = envOr('PAYSTACK_BASE_URL', 'https://api.paystack.co')
const REQUEST_TIMEOUT_MS = 20_000

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) {
    throw new Error('PAYSTACK_SECRET_KEY is not set — payouts cannot run')
  }
  return key
}

interface PaystackEnvelope<T> {
  status: boolean
  message: string
  data: T
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      authorization: `Bearer ${secretKey()}`,
      'content-type': 'application/json',
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  const text = await res.text()
  let payload: PaystackEnvelope<T>
  try {
    payload = JSON.parse(text) as PaystackEnvelope<T>
  } catch {
    throw new Error(`Paystack ${path} returned non-JSON (${res.status}): ${text.slice(0, 200)}`)
  }

  // Paystack signals failure in the body as well as the status code.
  if (!res.ok || payload.status === false) {
    throw new PaystackHttpError(res.status, `Paystack ${path} failed (${res.status}): ${payload.message || text.slice(0, 200)}`)
  }
  return payload.data
}

/*
 * Answers to POST /transfer that mean "no transfer was created". Anything
 * else — a timeout, a 5xx, non-JSON, or a 4xx about a duplicate reference
 * (which means one WAS created earlier) — leaves the outcome unknown.
 */
const DEFINITE_REJECTION = (err: unknown) =>
  err instanceof PaystackHttpError && err.status >= 400 && err.status < 500
  && !/duplicate|already|exist/i.test(err.message)

/** GHS major units → pesewas, guarding against float drift on the way. */
function toMinorUnits(amount: number): number {
  return Math.round(amount * 100)
}

function fromMinorUnits(amount: number): number {
  return Math.round(amount) / 100
}

interface PaystackBank {
  name: string
  code: string
  type?: string
}

interface PaystackRecipient {
  recipient_code: string
  details?: { account_name?: string | null; account_number?: string }
}

interface PaystackTransfer {
  transfer_code: string
  status: string
  reference?: string
}

interface PaystackTransferEvent {
  event: string
  data: {
    reference?: string
    transfer_code?: string
    amount: number
    status?: string
    reason?: string
    failures?: unknown
    updatedAt?: string
    updated_at?: string
    createdAt?: string
  }
}

export const paystackPayoutProvider: PayoutProvider = {
  id: 'paystack',

  async listDestinations(): Promise<PayoutDestination[]> {
    // Paystack splits Ghana destinations by `type`: mobile money telcos and
    // GHIPSS banks come from separate calls.
    const [momo, banks] = await Promise.all([
      call<PaystackBank[]>('/bank?country=ghana&currency=GHS&type=mobile_money'),
      call<PaystackBank[]>('/bank?country=ghana&currency=GHS'),
    ])

    const momoCodes = new Set(momo.map((b) => b.code))
    return [
      ...momo.map((b) => ({ name: b.name, code: b.code, type: 'mobile_money' as const })),
      ...banks
        .filter((b) => !momoCodes.has(b.code))
        .map((b) => ({ name: b.name, code: b.code, type: 'ghipss' as const })),
    ]
  },

  async createRecipient(input: RecipientInput): Promise<RecipientResult> {
    const data = await call<PaystackRecipient>('/transferrecipient', {
      method: 'POST',
      body: {
        type: input.type,
        name: input.name,
        account_number: input.accountNumber,
        bank_code: input.bankCode,
        currency: 'GHS',
      },
    })

    if (!data.recipient_code) {
      throw new Error('Paystack did not return a recipient code')
    }
    return {
      recipientCode: data.recipient_code,
      // Paystack resolves the real account name for banks; for some MoMo
      // wallets it echoes what we sent. Either way the user confirms it.
      accountName: data.details?.account_name || input.name,
    }
  },

  async sendTransfer(input: TransferInput): Promise<TransferResult> {
    let data: PaystackTransfer
    try {
      data = await call<PaystackTransfer>('/transfer', {
        method: 'POST',
        body: {
          source: 'balance',
          amount: toMinorUnits(input.amount),
          recipient: input.recipientCode,
          reference: input.reference,
          reason: input.reason,
        },
      })
    } catch (err) {
      if (DEFINITE_REJECTION(err)) throw new TransferRejectedError((err as Error).message)
      throw err
    }

    return {
      providerRef: data.transfer_code,
      // 'success' only comes back on test keys, where nothing is processed.
      // 'otp' means the transfer needs approval configured on the dashboard —
      // still pending from our side until a webhook says otherwise.
      status: data.status === 'success' ? 'paid' : 'pending',
    }
  },

  /** GET /transfer/verify/:reference — the reconciliation question. */
  async verifyTransfer(reference: string): Promise<TransferLookup> {
    let data: PaystackTransfer & { amount?: number; reason?: string; failures?: unknown }
    try {
      data = await call(`/transfer/verify/${encodeURIComponent(reference)}`)
    } catch (err) {
      // Only an explicit "no such transfer" means none was created. Anything
      // else (outage, 5xx) is thrown: the caller must not guess.
      if (err instanceof PaystackHttpError && (err.status === 404 || (err.status === 400 && /not found/i.test(err.message)))) {
        return { status: 'not_found' }
      }
      throw err
    }
    const status = data.status === 'success' ? 'paid'
      : data.status === 'failed' || data.status === 'reversed' || data.status === 'abandoned' ? 'failed'
        : 'pending'
    return {
      status,
      providerRef: data.transfer_code,
      amount: typeof data.amount === 'number' ? fromMinorUnits(data.amount) : undefined,
      failureReason: status === 'failed' ? `Transfer ${data.status}` : undefined,
      ...(data.status === 'reversed' ? { reversed: true } : {}),
    }
  },

  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean {
    const signature = headers['x-paystack-signature']
    if (!signature) return false

    let expected: string
    try {
      expected = createHmac('sha512', secretKey()).update(rawBody, 'utf8').digest('hex')
    } catch {
      return false
    }

    const a = Buffer.from(signature, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    // timingSafeEqual throws on length mismatch — check first, and keep the
    // comparison constant-time so the signature can't be probed byte by byte.
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  },

  parseWebhook(rawBody: string): PayoutWebhookEvent {
    const body = JSON.parse(rawBody) as PaystackTransferEvent
    const event = body.event ?? ''
    if (!event.startsWith('transfer.')) {
      throw new Error(`Not a transfer event: ${event || 'unknown'}`)
    }

    // 'transfer.reversed' means the money came back — for us that is a failure
    // with the same consequence: refund the wallet. `reversed` also lets the
    // finalizer refund a payout it had already marked paid.
    const status = event === 'transfer.success' ? 'paid' : 'failed'

    return {
      reference: body.data.reference ?? '',
      providerRef: body.data.transfer_code ?? '',
      status,
      amount: fromMinorUnits(body.data.amount ?? 0),
      timestamp: body.data.updatedAt || body.data.updated_at || body.data.createdAt || new Date().toISOString(),
      failureReason: status === 'failed'
        ? (body.data.reason || (event === 'transfer.reversed' ? 'Transfer reversed by the provider' : 'Transfer failed'))
        : undefined,
      ...(event === 'transfer.reversed' ? { reversed: true } : {}),
      raw: body,
    }
  },
}

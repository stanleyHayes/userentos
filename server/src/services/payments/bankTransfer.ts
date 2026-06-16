/**
 * Bank transfer adapter (Stanbic / GCB Pay style "pay-by-reference").
 *
 * Flow:
 *   1. We surface a deposit-account number + the server-side reference to the payer.
 *   2. The payer initiates a transfer from their banking app, quoting the reference.
 *   3. The bank's PSP (Payment Service Provider) POSTs us a webhook signed with
 *      HMAC-SHA256 over the raw body using `BANK_PSP_WEBHOOK_SECRET`,
 *      header `x-bank-signature`.
 *
 * No outbound API call is required at initiate time. `queryStatus` returns
 * `pending` because banks do not expose synchronous status lookups for
 * inbound transfers — the webhook is the source of truth.
 */

import { createHmac, timingSafeEqual, randomUUID } from 'crypto'
import type {
  PaymentProvider,
  CollectionInput,
  InitiateResult,
  WebhookEvent,
  ProviderStatus,
} from './types.js'

const WEBHOOK_SECRET = process.env.BANK_PSP_WEBHOOK_SECRET ?? ''
const DEPOSIT_ACCOUNT = process.env.BANK_DEPOSIT_ACCOUNT ?? '0000000000'
const DEPOSIT_BANK = process.env.BANK_DEPOSIT_BANK_NAME ?? 'Stanbic Bank Ghana'

function mapStatus(s: string | undefined | null): ProviderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'received':
    case 'settled':
    case 'completed':
    case 'success':
      return 'completed'
    case 'reversed':
    case 'failed':
    case 'rejected':
      return 'failed'
    default:
      return 'pending'
  }
}

class BankTransferProvider implements PaymentProvider {
  id = 'bank_transfer' as const

  async initiateCollection(input: CollectionInput): Promise<InitiateResult> {
    // No upstream call — generate a local correlator. The PSP echoes our
    // `reference` (from the payer's narration) when the credit lands.
    const providerRef = `BNK-${randomUUID()}`
    return {
      providerRef,
      status: 'pending',
      instructions:
        `Transfer GHS ${input.amount.toFixed(2)} to ${DEPOSIT_BANK} acct ${DEPOSIT_ACCOUNT}. ` +
        `IMPORTANT: include reference "${input.reference}" in the narration so we can match your payment.`,
    }
  }

  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean {
    const provided = headers['x-bank-signature'] ?? headers['X-Bank-Signature']
    if (!provided || !WEBHOOK_SECRET) return false
    const expected = createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex')
    try {
      const a = Buffer.from(expected, 'hex')
      const b = Buffer.from(provided, 'hex')
      if (a.length !== b.length) return false
      return timingSafeEqual(a, b)
    } catch {
      return false
    }
  }

  parseWebhook(rawBody: string): WebhookEvent {
    const data = JSON.parse(rawBody) as {
      reference?: string
      narration?: string
      transactionId?: string
      status?: string
      amount?: number | string
      valueDate?: string
    }
    // Banks usually echo the narration the payer typed. We fall back to
    // explicit `reference` if the PSP normalizes it.
    const reference = data.reference ?? extractReference(data.narration ?? '') ?? ''
    return {
      reference,
      providerRef: data.transactionId ?? '',
      status: mapStatus(data.status),
      amount: Number(data.amount ?? 0),
      timestamp: data.valueDate ?? new Date().toISOString(),
      raw: data,
    }
  }

  async queryStatus(_providerRef: string): Promise<ProviderStatus> {
    // Banks don't typically expose synchronous lookup for inbound transfers.
    return 'pending'
  }
}

/** Extract a `PAY-XXXX-XXXX` style reference from a free-text narration. */
function extractReference(text: string): string | null {
  const m = text.match(/PAY-[A-Z0-9-]+/i)
  return m ? m[0].toUpperCase() : null
}

export const bankTransferProvider: PaymentProvider = new BankTransferProvider()

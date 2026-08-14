/**
 * MTN Mobile Money — Collections (RequestToPay) adapter.
 *
 * Reference: https://momodeveloper.mtn.com/docs/services/collection/operations
 *
 * Auth model:
 *   1. POST {base}/collection/token/  with Basic-auth(MTN_MOMO_API_USER:MTN_MOMO_API_KEY)
 *      and `Ocp-Apim-Subscription-Key: MTN_MOMO_SUBSCRIPTION_KEY`
 *      → { access_token, token_type, expires_in }
 *   2. PUT {base}/collection/v1_0/requesttopay  with the bearer token,
 *      `X-Reference-Id: <uuid>`, `X-Target-Environment: <sandbox|live>`,
 *      `Ocp-Apim-Subscription-Key: ...`
 *      Body: { amount, currency: 'GHS', externalId, payer, payerMessage, payeeNote }
 *   3. Provider POSTs to MTN_MOMO_CALLBACK_URL when the payer approves/declines.
 *      Webhook signature is verified using the subscription primary key.
 *
 * The token is cached in-memory with a small safety margin.
 */

import { randomUUID, createHmac, timingSafeEqual } from 'crypto'
import type {
  PaymentProvider,
  CollectionInput,
  InitiateResult,
  WebhookEvent,
  ProviderStatus,
} from './types.js'

const BASE_URL = process.env.MTN_MOMO_BASE_URL ?? 'https://sandbox.momodeveloper.mtn.com'
const SUBSCRIPTION_KEY = process.env.MTN_MOMO_SUBSCRIPTION_KEY ?? ''
const API_USER = process.env.MTN_MOMO_API_USER ?? ''
const API_KEY = process.env.MTN_MOMO_API_KEY ?? ''
const CALLBACK_URL = process.env.MTN_MOMO_CALLBACK_URL ?? ''
const TARGET_ENV = process.env.MTN_MOMO_TARGET_ENV ?? 'sandbox'

interface CachedToken { value: string; expiresAt: number }
let tokenCache: CachedToken | null = null

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.value
  const basic = Buffer.from(`${API_USER}:${API_KEY}`).toString('base64')
  const res = await fetch(`${BASE_URL}/collection/token/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`[MTN MoMo] token request failed: ${res.status} ${text}`)
  }
  const data = (await res.json()) as { access_token: string; expires_in: number }
  tokenCache = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return tokenCache.value
}

// MTN status → our normalized status
function mapStatus(s: string | undefined | null): ProviderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'SUCCESSFUL':
      return 'completed'
    case 'FAILED':
    case 'REJECTED':
    case 'TIMEOUT':
      return 'failed'
    default:
      return 'pending'
  }
}

class MtnMomoProvider implements PaymentProvider {
  id = 'mtn_momo' as const

  async initiateCollection(input: CollectionInput): Promise<InitiateResult> {
    const token = await getAccessToken()
    // X-Reference-Id is the provider-side correlator. We MUST keep it for status lookups.
    const xReferenceId = randomUUID()

    const body = {
      amount: input.amount.toFixed(2),
      currency: 'GHS',
      externalId: input.reference, // our PAY-XXXX-XXXX so we can correlate webhooks
      payer: { partyIdType: 'MSISDN', partyId: input.phone },
      payerMessage: input.narration.slice(0, 160),
      payeeNote: input.narration.slice(0, 160),
    }

    const res = await fetch(`${BASE_URL}/collection/v1_0/requesttopay`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Reference-Id': xReferenceId,
        'X-Target-Environment': TARGET_ENV,
        'X-Callback-Url': CALLBACK_URL,
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    // 202 Accepted is the documented success response.
    if (res.status !== 202) {
      const text = await res.text().catch(() => '')
      throw new Error(`[MTN MoMo] requesttopay failed: ${res.status} ${text}`)
    }

    return {
      providerRef: xReferenceId,
      status: 'pending',
      instructions: 'Check your phone — approve the MTN Mobile Money prompt to complete payment.',
    }
  }

  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean {
    // MTN's "hooks" feature signs the body with HMAC-SHA256 using the
    // subscription primary key, returned in `X-Hook-Signature` (case-insensitive).
    // If the signature header is absent, treat as untrusted.
    const provided =
      headers['x-hook-signature'] ?? headers['X-Hook-Signature'] ?? headers['x-callback-signature']
    if (!provided || !SUBSCRIPTION_KEY) return false
    const expected = createHmac('sha256', SUBSCRIPTION_KEY).update(rawBody).digest('hex')
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
      financialTransactionId?: string
      externalId?: string
      amount?: string | number
      currency?: string
      payer?: { partyId?: string }
      status?: string
      reason?: string
      // Some MTN deployments include the X-Reference-Id in body; otherwise the
      // controller can also pass the URL/header through, but per docs the body
      // includes `referenceId` for the request.
      referenceId?: string
    }
    return {
      reference: data.externalId ?? '',
      providerRef: data.referenceId ?? data.financialTransactionId ?? '',
      status: mapStatus(data.status),
      amount: Number(data.amount ?? 0),
      timestamp: new Date().toISOString(),
      raw: data,
    }
  }

  async queryStatus(providerRef: string): Promise<ProviderStatus> {
    const token = await getAccessToken()
    const res = await fetch(`${BASE_URL}/collection/v1_0/requesttopay/${providerRef}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Target-Environment': TARGET_ENV,
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
      },
    })
    if (!res.ok) {
      console.warn(`[MTN MoMo] queryStatus failed: ${res.status}`)
      return 'pending'
    }
    const data = (await res.json()) as { status?: string }
    return mapStatus(data.status)
  }
}

export const mtnMomoProvider: PaymentProvider = new MtnMomoProvider()

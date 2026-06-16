/**
 * Telecel Cash adapter (Vodafone Cash → Telecel Cash post-rebrand).
 *
 * The published API surface is OAuth2 client_credentials → POST a collection
 * request → receive callback signed with HMAC-SHA256 over the raw body using
 * `TELECEL_WEBHOOK_SECRET`, signature in header `X-Telecel-Signature`.
 *
 * This is a structurally-correct stub. An ops engineer must plug live
 * endpoint paths once Telecel finalizes the public API contract.
 */

import { createHmac, timingSafeEqual, randomUUID } from 'crypto'
import type {
  PaymentProvider,
  CollectionInput,
  InitiateResult,
  WebhookEvent,
  ProviderStatus,
} from './types.js'

const BASE_URL = process.env.TELECEL_BASE_URL ?? 'https://api.telecel.com.gh'
const CLIENT_ID = process.env.TELECEL_CLIENT_ID ?? ''
const CLIENT_SECRET = process.env.TELECEL_CLIENT_SECRET ?? ''
const WEBHOOK_SECRET = process.env.TELECEL_WEBHOOK_SECRET ?? ''

interface CachedToken { value: string; expiresAt: number }
let tokenCache: CachedToken | null = null

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.value
  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'collections',
    }).toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`[Telecel] token request failed: ${res.status} ${text}`)
  }
  const data = (await res.json()) as { access_token: string; expires_in: number }
  tokenCache = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return tokenCache.value
}

function mapStatus(s: string | undefined | null): ProviderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'success':
    case 'completed':
    case 'paid':
      return 'completed'
    case 'failed':
    case 'cancelled':
    case 'expired':
      return 'failed'
    default:
      return 'pending'
  }
}

class TelecelCashProvider implements PaymentProvider {
  id = 'telecel_cash' as const

  async initiateCollection(input: CollectionInput): Promise<InitiateResult> {
    const token = await getAccessToken()
    const providerRef = randomUUID()
    const body = {
      transactionId: providerRef,
      externalReference: input.reference,
      amount: input.amount,
      currency: 'GHS',
      msisdn: input.phone,
      description: input.narration,
      callbackUrl: `${process.env.PUBLIC_BASE_URL ?? ''}/api/webhooks/payments/telecel`,
    }
    const res = await fetch(`${BASE_URL}/v1/collections/charge`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`[Telecel] charge failed: ${res.status} ${text}`)
    }
    return {
      providerRef,
      status: 'pending',
      instructions: 'Dial the Telecel Cash USSD prompt on your phone and approve the payment.',
    }
  }

  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean {
    const provided = headers['x-telecel-signature'] ?? headers['X-Telecel-Signature']
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
      transactionId?: string
      externalReference?: string
      status?: string
      amount?: number | string
      timestamp?: string
    }
    return {
      reference: data.externalReference ?? '',
      providerRef: data.transactionId ?? '',
      status: mapStatus(data.status),
      amount: Number(data.amount ?? 0),
      timestamp: data.timestamp ?? new Date().toISOString(),
      raw: data,
    }
  }

  async queryStatus(providerRef: string): Promise<ProviderStatus> {
    const token = await getAccessToken()
    const res = await fetch(`${BASE_URL}/v1/collections/${providerRef}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return 'pending'
    const data = (await res.json()) as { status?: string }
    return mapStatus(data.status)
  }
}

export const telecelCashProvider: PaymentProvider = new TelecelCashProvider()

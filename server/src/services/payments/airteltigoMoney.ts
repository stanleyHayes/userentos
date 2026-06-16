/**
 * AirtelTigo Money adapter.
 *
 * Mirrors the typical Airtel Africa API contract:
 *   - OAuth2 client_credentials at /auth/oauth2/token
 *   - POST /merchant/v1/payments/  with `X-Country: GH`, `X-Currency: GHS`
 *   - Webhooks signed with HMAC-SHA256 over raw body, header `x-auth-signature`
 *
 * Stub structure — endpoint paths and signature header name MUST be re-validated
 * against the operator's current API spec when going live.
 */

import { createHmac, timingSafeEqual, randomUUID } from 'crypto'
import type {
  PaymentProvider,
  CollectionInput,
  InitiateResult,
  WebhookEvent,
  ProviderStatus,
} from './types.js'

const BASE_URL = process.env.AIRTELTIGO_BASE_URL ?? 'https://openapi.airtel.africa'
const CLIENT_ID = process.env.AIRTELTIGO_CLIENT_ID ?? ''
const CLIENT_SECRET = process.env.AIRTELTIGO_CLIENT_SECRET ?? ''
const WEBHOOK_SECRET = process.env.AIRTELTIGO_WEBHOOK_SECRET ?? ''

interface CachedToken { value: string; expiresAt: number }
let tokenCache: CachedToken | null = null

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.value
  const res = await fetch(`${BASE_URL}/auth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`[AirtelTigo] token request failed: ${res.status} ${text}`)
  }
  const data = (await res.json()) as { access_token: string; expires_in: number }
  tokenCache = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return tokenCache.value
}

function mapStatus(s: string | undefined | null): ProviderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'TS':
    case 'SUCCESS':
    case 'COMPLETED':
      return 'completed'
    case 'TF':
    case 'FAILED':
    case 'TA': // aborted
      return 'failed'
    default:
      return 'pending'
  }
}

class AirtelTigoMoneyProvider implements PaymentProvider {
  id = 'airteltigo_money' as const

  async initiateCollection(input: CollectionInput): Promise<InitiateResult> {
    const token = await getAccessToken()
    const providerRef = randomUUID()
    const body = {
      reference: input.reference,
      subscriber: { country: 'GH', currency: 'GHS', msisdn: input.phone },
      transaction: { amount: input.amount, country: 'GH', currency: 'GHS', id: providerRef },
      additional_info: [{ key: 'narration', value: input.narration }],
    }
    const res = await fetch(`${BASE_URL}/merchant/v1/payments/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Country': 'GH',
        'X-Currency': 'GHS',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`[AirtelTigo] payments failed: ${res.status} ${text}`)
    }
    return {
      providerRef,
      status: 'pending',
      instructions: 'Approve the AirtelTigo Money prompt on your phone to complete payment.',
    }
  }

  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean {
    const provided = headers['x-auth-signature'] ?? headers['X-Auth-Signature']
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
      transaction?: { id?: string; status_code?: string; message?: string; airtel_money_id?: string }
      reference?: string
      amount?: number | string
    }
    return {
      reference: data.reference ?? '',
      providerRef: data.transaction?.airtel_money_id ?? data.transaction?.id ?? '',
      status: mapStatus(data.transaction?.status_code),
      amount: Number(data.amount ?? 0),
      timestamp: new Date().toISOString(),
      raw: data,
    }
  }

  async queryStatus(providerRef: string): Promise<ProviderStatus> {
    const token = await getAccessToken()
    const res = await fetch(`${BASE_URL}/standard/v1/payments/${providerRef}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Country': 'GH',
        'X-Currency': 'GHS',
      },
    })
    if (!res.ok) return 'pending'
    const data = (await res.json()) as { data?: { transaction?: { status?: string } } }
    return mapStatus(data.data?.transaction?.status)
  }
}

export const airtelTigoMoneyProvider: PaymentProvider = new AirtelTigoMoneyProvider()

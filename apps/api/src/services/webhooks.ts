import crypto from 'crypto'
import dns from 'dns/promises'
import net from 'net'
import type { Types } from 'mongoose'
import { WebhookSubscription, type IWebhookSubscription } from '../models/WebhookSubscription.js'
import { logger } from '../utils/logger.js'

const MAX_RETRIES = 5
const RETRY_DELAYS_MS = [1000, 5000, 15000, 60000, 300000] // exponential-ish backoff
const DELIVERY_TIMEOUT_MS = 10_000

function ipIsPrivate(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    if (a === 10 || a === 127 || a === 0) return true
    if (a === 169 && b === 254) return true            // link-local incl. cloud metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true  // CGNAT
    return false
  }
  const v = ip.toLowerCase()
  if (v === '::1' || v === '::') return true
  if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true // ULA / link-local
  if (v.startsWith('::ffff:')) return ipIsPrivate(v.slice(7))                        // IPv4-mapped
  return false
}

/**
 * Reject webhook URLs that could be used for SSRF (internal hosts, cloud metadata,
 * non-https). Enforced in production; permissive in dev/e2e so local receivers work.
 * Re-checked at delivery time to mitigate DNS rebinding.
 */
export async function assertSafeWebhookUrl(rawUrl: string): Promise<void> {
  let u: URL
  try { u = new URL(rawUrl) } catch { throw new Error('Invalid URL') }
  if (process.env.NODE_ENV !== 'production') return
  if (u.protocol !== 'https:') throw new Error('Webhook URL must use https')
  if (u.username || u.password) throw new Error('Webhook URL must not contain credentials')
  const host = u.hostname
  if (net.isIP(host)) {
    if (ipIsPrivate(host)) throw new Error('Webhook URL resolves to a private/loopback address')
    return
  }
  let addrs: { address: string }[]
  try { addrs = await dns.lookup(host, { all: true }) } catch { throw new Error('Webhook URL host could not be resolved') }
  if (!addrs.length || addrs.some((a) => ipIsPrivate(a.address))) {
    throw new Error('Webhook URL resolves to a private/loopback address')
  }
}

export type WebhookEvent =
  | 'application.created'
  | 'application.approved'
  | 'application.rejected'
  | 'agreement.signed'
  | 'agreement.activated'
  | 'agreement.expiring'
  | 'payment.completed'
  | 'payment.failed'
  | 'lease.expiring'
  | 'maintenance.escalated'
  | 'dispute.filed'
  | 'dispute.resolved'

function signPayload(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

async function deliver(sub: IWebhookSubscription, event: WebhookEvent, data: unknown): Promise<boolean> {
  const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() })
  const signature = signPayload(sub.secret, payload)

  try {
    // Re-validate at delivery time (DNS rebinding) and bound the request with a timeout.
    await assertSafeWebhookUrl(sub.url)
    const res = await fetch(sub.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RentOS-Signature': `sha256=${signature}`,
        'X-RentOS-Event': event,
        'User-Agent': 'RentOS-Webhook/1.0',
      },
      body: payload,
      // Never follow redirects: a 3xx Location could point at an internal host,
      // bypassing assertSafeWebhookUrl (SSRF). Any 3xx is a failed delivery.
      redirect: 'manual',
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    })

    if (res.status >= 300 && res.status < 400) {
      logger.warn(`[Webhook] ${sub.url} responded with redirect (${res.status}) — treating as failed delivery`)
      return false
    }

    const ok = res.status >= 200 && res.status < 300
    if (ok) {
      await WebhookSubscription.updateOne(
        { _id: sub._id },
        { $set: { lastDeliveredAt: new Date().toISOString(), failureCount: 0 } },
      )
      return true
    }
    return false
  } catch {
    return false
  }
}

async function deliverWithRetry(sub: IWebhookSubscription, event: WebhookEvent, data: unknown) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const ok = await deliver(sub, event, data)
    if (ok) {
      logger.debug(`[Webhook] Delivered ${event} to ${sub.url} (attempt ${attempt + 1})`)
      return
    }

    if (attempt < MAX_RETRIES) {
      const delay = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
      logger.warn(`[Webhook] ${event} to ${sub.url} failed (attempt ${attempt + 1}), retrying in ${delay}ms`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }

  // All retries exhausted
  await WebhookSubscription.updateOne(
    { _id: sub._id },
    {
      $set: { lastFailureAt: new Date().toISOString() },
      $inc: { failureCount: 1 },
    },
  )

  // Auto-disable after 50 consecutive failures
  if (sub.failureCount + 1 >= 50) {
    await WebhookSubscription.updateOne({ _id: sub._id }, { $set: { isActive: false } })
    logger.warn(`[Webhook] Auto-disabled subscription ${(sub._id as Types.ObjectId).toString()} after 50 failures`)
  }
}

/**
 * Dispatch a webhook event to all matching active subscriptions.
 * Fire-and-forget: does not block the caller.
 */
export function dispatchWebhook(event: WebhookEvent, data: unknown, filter?: { userId?: string }) {
  const query: Record<string, unknown> = { isActive: true, events: { $in: [event, '*'] } }
  if (filter?.userId) query.userId = filter.userId

  WebhookSubscription.find(query)
    .then((subs) => {
      for (const sub of subs) {
        // Don't await — fire and forget
        deliverWithRetry(sub, event, data).catch((err) => {
          logger.error('[Webhook] Unexpected delivery error:', err)
        })
      }
    })
    .catch((err) => {
      logger.error('[Webhook] Failed to fetch subscriptions:', err)
    })
}

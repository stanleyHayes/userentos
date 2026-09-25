import crypto from 'crypto'
import dns from 'dns/promises'
import type { LookupAddress, LookupOptions } from 'dns'
import http from 'http'
import https from 'https'
import net from 'net'
import type { Types } from 'mongoose'
import { WebhookSubscription, type IWebhookSubscription } from '../models/WebhookSubscription.js'
import { logger } from '../utils/logger.js'

const MAX_RETRIES = 5
const RETRY_DELAYS_MS = [1000, 5000, 15000, 60000, 300000] // exponential-ish backoff
const DELIVERY_TIMEOUT_MS = 10_000

/*
 * Addresses a webhook may never reach. A BlockList rather than string
 * prefixes: it understands every spelling of an address, including
 * IPv4-mapped IPv6 in hex (::ffff:7f00:1 is 127.0.0.1), which the prefix
 * checks this replaced let through.
 */
const BLOCKED = new net.BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) BLOCKED.addSubnet(network, prefix, 'ipv4')
for (const [network, prefix] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['2002::', 16],
] as const) BLOCKED.addSubnet(network, prefix, 'ipv6')

export function ipIsPrivate(ip: string): boolean {
  const family = net.isIPv4(ip) ? 'ipv4' : net.isIPv6(ip) ? 'ipv6' : null
  // Anything that is not a well-formed address is treated as unsafe.
  return family === null || BLOCKED.check(ip, family)
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void

/**
 * The resolver the delivery socket connects through, in production.
 *
 * Checking a hostname and then letting fetch resolve it again is a DNS
 * rebinding hole: the first answer can be public and the second 127.0.0.1 or
 * the cloud metadata address. Here the answer that is validated is the answer
 * the socket uses — there is no second resolution to rebind.
 */
export function pinnedLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  dns.lookup(hostname, { all: true, family: options.family ?? 0 }).then((addresses) => {
    if (!addresses.length || addresses.some((a) => ipIsPrivate(a.address))) {
      callback(Object.assign(new Error('Webhook URL resolves to a private/loopback address'), { code: 'EBLOCKED' }), '')
      return
    }
    if (options.all) callback(null, addresses)
    else callback(null, addresses[0].address, addresses[0].family)
  }, (err: NodeJS.ErrnoException) => callback(err, ''))
}

/** POST and report the status code. Redirects are never followed (a 3xx is returned as-is). */
function postJson(target: URL, payload: string, headers: Record<string, string>): Promise<number> {
  const transport = target.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const req = transport.request(target, {
      method: 'POST',
      headers: { ...headers, 'Content-Length': String(Buffer.byteLength(payload)) },
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      // Dev and e2e receivers live on localhost; the policy is production's.
      ...(process.env.NODE_ENV === 'production' ? { lookup: pinnedLookup } : {}),
    }, (res) => {
      res.resume()
      res.on('end', () => resolve(res.statusCode ?? 0))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end(payload)
  })
}

/**
 * Reject webhook URLs that could be used for SSRF (internal hosts, cloud metadata,
 * non-https). Enforced in production; permissive in dev/e2e so local receivers work.
 * The connection itself goes through pinnedLookup, so a hostname that resolves
 * differently at delivery time is refused there too.
 */
export async function assertSafeWebhookUrl(rawUrl: string): Promise<void> {
  let u: URL
  try { u = new URL(rawUrl) } catch { throw new Error('Invalid URL') }
  if (process.env.NODE_ENV !== 'production') return
  if (u.protocol !== 'https:') throw new Error('Webhook URL must use https')
  if (u.username || u.password) throw new Error('Webhook URL must not contain credentials')
  // URL keeps the brackets around an IPv6 literal; net.isIP does not accept them.
  const host = u.hostname.replace(/^\[|\]$/g, '')
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

export async function deliver(sub: Pick<IWebhookSubscription, '_id' | 'url' | 'secret'>, event: WebhookEvent, data: unknown): Promise<boolean> {
  const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() })
  const signature = signPayload(sub.secret, payload)

  try {
    // Scheme, credentials and IP-literal checks; hostnames are checked again
    // by pinnedLookup on the connection itself.
    await assertSafeWebhookUrl(sub.url)
    const status = await postJson(new URL(sub.url), payload, {
      'Content-Type': 'application/json',
      'X-RentOS-Signature': `sha256=${signature}`,
      'X-RentOS-Event': event,
      'User-Agent': 'RentOS-Webhook/1.0',
    })

    // Never follow redirects: a 3xx Location could point at an internal host,
    // bypassing the address checks (SSRF). Any 3xx is a failed delivery.
    if (status >= 300 && status < 400) {
      logger.warn(`[Webhook] ${sub.url} responded with redirect (${status}) — treating as failed delivery`)
      return false
    }

    const ok = status >= 200 && status < 300
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

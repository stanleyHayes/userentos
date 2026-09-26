import { createHmac } from 'node:crypto'
import { envOptional } from './env.js'
import { logger } from './logger.js'

/**
 * Keyed, daily-rotating digest for counting unique visitors to public pages
 * (registry pageviews, storefront traffic) without keeping anything that
 * identifies them.
 *
 * A plain SHA-256 of an IP is not anonymous: there are only 2^32 IPv4
 * addresses, so anyone with the table can hash them all and read every
 * visitor's address back. Here the digest is an HMAC under a key derived from
 * VISITOR_HASH_SECRET and the UTC date, so:
 *  - without the server secret the digest cannot be reversed or matched;
 *  - the same visitor gets a different digest each day, so no stored value
 *    links one person's visits across days. Unique-visitor counts over a
 *    multi-day window therefore count visitor-days, by design.
 */
const DEV_FALLBACK_SECRET = 'rentos-development-only-visitor-hash-secret'

function secret(): string {
  return envOptional('VISITOR_HASH_SECRET') ?? DEV_FALLBACK_SECRET
}

/** The UTC calendar day the key belongs to, e.g. "2026-09-26". Ghana is UTC+0. */
function dayOf(at: Date): string {
  return at.toISOString().slice(0, 10)
}

export function visitorHash(value: string, at: Date = new Date()): string {
  const dayKey = createHmac('sha256', secret()).update(`visitor-hash:${dayOf(at)}`).digest()
  return createHmac('sha256', dayKey).update(value).digest('hex')
}

/**
 * Boot check. The fallback is a string in this repository, so in production it
 * would make every digest reversible again — say so loudly rather than refuse
 * to start over a metrics feature.
 */
export function warnIfVisitorHashSecretUnset(): void {
  if (process.env.NODE_ENV === 'production' && !envOptional('VISITOR_HASH_SECRET')) {
    logger.warn('[visitorHash] VISITOR_HASH_SECRET is not set — visitor hashes use the public development key and can be reversed. Set it to a long random value.')
  }
}

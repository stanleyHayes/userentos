/**
 * IndexNow (https://www.indexnow.org): tells Bing — and through it ChatGPT
 * search, DuckDuckGo and Yahoo — as well as Yandex, Seznam and Naver about a
 * new or changed public page the moment it changes, instead of waiting for the
 * next crawl. Google does not take part; it reads the sitemap.
 *
 * The key is public by design: the file apps/web/public/<key>.txt proves we
 * own the host, and INDEXNOW_KEY must hold the same value. Without the key, or
 * outside production, nothing is sent.
 */
import { publicBaseUrl } from '../utils/env.js'
import { logger } from '../utils/logger.js'
import { listingPathFor, slugify } from './listings.js'
import { TYPE_FACETS } from './seoLanding.js'

const ENDPOINT = 'https://api.indexnow.org/indexnow'
const KEY_FORMAT = /^[A-Za-z0-9-]{8,128}$/
const BATCH = 10_000

export function indexNowEnabled(): boolean {
  return process.env.NODE_ENV === 'production' && KEY_FORMAT.test(process.env.INDEXNOW_KEY ?? '')
}

export interface IndexNowResult {
  /** URLs in batches IndexNow accepted (HTTP 200 or 202). */
  accepted: number
  /** URLs in batches it refused, or that never reached it. */
  failed: number
  /** One per batch: the HTTP status, or 0 when the request itself failed. */
  statuses: number[]
}

/**
 * Submits platform URLs or paths in batches of 10,000. Null when nothing was
 * sent: no key (or not production, unless forced), or no URL on this host.
 * Never throws; a failed batch does not stop the others.
 */
export async function submitToIndexNow(paths: string[], opts: { force?: boolean } = {}): Promise<IndexNowResult | null> {
  const key = process.env.INDEXNOW_KEY ?? ''
  if (!(opts.force ? KEY_FORMAT.test(key) : indexNowEnabled())) return null
  const base = publicBaseUrl()
  const host = new URL(base).host
  const urlList = [...new Set(paths.map((p) => (p.startsWith('http') ? p : `${base}${p.startsWith('/') ? '' : '/'}${p}`)))]
    .filter((url) => { try { return new URL(url).host === host } catch { return false } })
  if (!urlList.length) return null
  const result: IndexNowResult = { accepted: 0, failed: 0, statuses: [] }
  for (let i = 0; i < urlList.length; i += BATCH) {
    const batch = urlList.slice(i, i + BATCH)
    let status = 0
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ host, key, keyLocation: `${base}/${key}.txt`, urlList: batch }),
        signal: AbortSignal.timeout(10_000),
      })
      status = response.status
    } catch (err) {
      logger.warn(`[IndexNow] submission failed: ${(err as Error).message}`)
    }
    result.statuses.push(status)
    if (status === 200 || status === 202) result.accepted += batch.length
    else {
      result.failed += batch.length
      if (status) logger.warn(`[IndexNow] ${status} for ${batch.length} URL(s)`)
    }
  }
  return result
}

/** A listing's own page and the search pages it appears on. */
export function listingIndexPaths(listing: Parameters<typeof listingPathFor>[0]): string[] {
  const purpose = listing.listingType === 'sale' ? 'buy' : listing.listingType === 'short_let' ? 'short-stay' : 'rent'
  const city = slugify(listing.address?.city)
  const area = slugify(listing.address?.neighborhood)
  const levels = [`/${purpose}`, city ? `/${purpose}/${city}` : '', city && area ? `/${purpose}/${city}/${area}` : ''].filter(Boolean)
  const facet = TYPE_FACETS.find((t) => t.types.includes(listing.type ?? ''))
  return [listingPathFor(listing), ...levels, ...(facet ? levels.map((l) => `${l}/${facet.slug}`) : [])]
}

import type { CorsOptions } from 'cors'

type OriginCallback = Parameters<Exclude<CorsOptions['origin'], string | boolean | RegExp | (string | boolean | RegExp)[] | undefined>>[1]

interface CorsPolicyOptions {
  /** Exact origins, or `https://*.example.com` for any single-label subdomain. */
  allowed: string[]
  /** Development with no configured origins: allow everything. */
  permissive: boolean
  /** Whether a hostname is a storefront custom domain that has been verified. */
  isStorefrontDomain?: (hostname: string) => Promise<boolean>
}

const CACHE_MS = 5 * 60_000
const CACHE_LIMIT = 1000

function wildcardMatcher(pattern: string): RegExp | null {
  const match = /^(https?):\/\/\*\.([a-z0-9.-]+)$/i.exec(pattern)
  if (!match) return null
  const [, scheme, base] = match
  return new RegExp(`^${scheme}://[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.${base.replace(/\./g, '\\.')}$`, 'i')
}

/**
 * Browsers enforce CORS; the server only decides which origins to name. An
 * origin that isn't allowed gets no CORS headers (so the browser refuses to
 * expose the response) rather than an error, which used to turn every such
 * request into an unthrottled 500 with a stack trace in the logs.
 */
export function createCorsOrigin({ allowed, permissive, isStorefrontDomain }: CorsPolicyOptions) {
  const exact = new Set(allowed.filter(origin => !origin.includes('*')))
  const wildcards = allowed.map(wildcardMatcher).filter((m): m is RegExp => m !== null)
  const cache = new Map<string, { ok: boolean; until: number }>()

  async function storefrontAllowed(origin: string): Promise<boolean> {
    if (!isStorefrontDomain) return false
    let hostname: string
    try {
      const url = new URL(origin)
      if (url.protocol !== 'https:') return false
      hostname = url.hostname.toLowerCase()
    } catch { return false }
    const hit = cache.get(hostname)
    if (hit && hit.until > Date.now()) return hit.ok
    const ok = await isStorefrontDomain(hostname).catch(() => false)
    if (cache.size >= CACHE_LIMIT) cache.clear()
    cache.set(hostname, { ok, until: Date.now() + CACHE_MS })
    return ok
  }

  return (origin: string | undefined, callback: OriginCallback) => {
    if (!origin || permissive || exact.has(origin) || wildcards.some(re => re.test(origin))) { callback(null, true); return }
    void storefrontAllowed(origin).then(ok => callback(null, ok))
  }
}

/**
 * Storefront domain logic: slug policy, tenant scoping and the custom-domain
 * lifecycle (spec §4).
 *
 * The isolation rule the spec is most insistent about lives here:
 * `storefrontScope()` is the ONLY way callers build a storefront property
 * filter, so a listing from another seller cannot reach a storefront through
 * search, recommendations or a cached response.
 */
import crypto from 'crypto'
import { promises as dns } from 'dns'
import { Storefront } from '../models/Storefront.js'
import { StorefrontDomain } from '../models/StorefrontDomain.js'

/**
 * Slugs that must never be assignable: platform hostnames, auth surfaces and
 * anything that would let a storefront impersonate RentOS itself.
 */
export const RESERVED_SLUGS = new Set([
  'www', 'admin', 'api', 'app', 'studio', 'auth', 'support', 'system',
  'mail', 'smtp', 'ftp', 'ns1', 'ns2', 'cdn', 'assets', 'static', 'media',
  'dashboard', 'account', 'billing', 'pay', 'payments', 'checkout',
  'rentos', 'userentos', 'help', 'docs', 'blog', 'status', 'dev', 'staging',
  'test', 'internal', 'security', 'legal', 'privacy', 'terms', 'about',
])

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/

export function validateSlug(slug: string): { ok: true } | { ok: false; reason: string } {
  const normalized = slug.trim().toLowerCase()
  if (!SLUG_PATTERN.test(normalized)) {
    return { ok: false, reason: 'Use 3–40 characters: lowercase letters, numbers and hyphens, not starting or ending with a hyphen.' }
  }
  if (RESERVED_SLUGS.has(normalized)) {
    return { ok: false, reason: `"${normalized}" is reserved by the platform.` }
  }
  return { ok: true }
}

/**
 * The tenant filter. Every storefront-scoped read must start from this.
 *
 * Returning a filter (rather than running the query) keeps the scoping
 * composable while making it impossible to forget: there is no code path that
 * builds a storefront property query without an ownerId.
 */
export function storefrontScope(storefront: { ownerId: string }, extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    landlordId: storefront.ownerId,
  }
}

export interface PublicStorefrontFilter {
  landlordId: string
  listingStatus: { $in: string[] }
  isActive: { $ne: boolean }
}

/** Public storefront listings: scoped to the owner AND publicly visible. */
export function publicStorefrontScope(storefront: { ownerId: string }): PublicStorefrontFilter {
  return {
    listingStatus: { $in: ['approved', 'published'] },
    isActive: { $ne: false },
    // Owner last: a caller-supplied landlordId can never widen the scope.
    landlordId: storefront.ownerId,
  }
}

export function newVerificationToken(): string {
  return `rentos-verify=${crypto.randomBytes(16).toString('hex')}`
}

const DOMAIN_PATTERN = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/

export function validateDomain(domain: string): { ok: true } | { ok: false; reason: string } {
  const normalized = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!DOMAIN_PATTERN.test(normalized)) {
    return { ok: false, reason: 'Enter a bare domain such as homesbyama.com' }
  }
  // A seller must not be able to claim a platform hostname.
  if (normalized.endsWith('userentos.com') || normalized.endsWith('rentos.gh')) {
    return { ok: false, reason: 'Platform domains cannot be attached as custom domains.' }
  }
  return { ok: true }
}

/**
 * Check the TXT record the seller was asked to publish.
 *
 * Split from the route so it can run from a background job as well as an
 * on-demand "check now", and so tests can stub DNS.
 */
export async function checkDomainOwnership(
  domain: string,
  expectedToken: string,
  resolver: (name: string) => Promise<string[][]> = dns.resolveTxt,
): Promise<{ verified: boolean; reason?: string }> {
  try {
    const records = await resolver(domain)
    const flattened = records.map((chunks) => chunks.join(''))
    if (flattened.some((value) => value.trim() === expectedToken)) {
      return { verified: true }
    }
    return { verified: false, reason: 'The TXT record was not found yet. DNS can take up to an hour to propagate.' }
  } catch (err) {
    return { verified: false, reason: `Could not read DNS for ${domain}: ${(err as Error).message}` }
  }
}

/**
 * Resolve a hostname to its storefront, for request-time tenant routing.
 * A custom domain only resolves once it is verified AND active.
 */
export async function resolveStorefrontByHost(host: string): Promise<{ slug: string } | null> {
  const hostname = host.toLowerCase().split(':')[0]

  const platformSuffix = '.userentos.com'
  if (hostname.endsWith(platformSuffix)) {
    const slug = hostname.slice(0, -platformSuffix.length)
    if (!slug || RESERVED_SLUGS.has(slug)) return null
    const storefront = await Storefront.findOne({ slug, status: 'active' }).lean()
    return storefront ? { slug } : null
  }

  const domain = await StorefrontDomain.findOne({ domain: hostname, status: 'active' }).lean()
  if (!domain) return null
  const storefront = await Storefront.findById(domain.storefrontId).lean()
  return storefront && storefront.status === 'active' ? { slug: storefront.slug } : null
}

/**
 * Resolve a storefront from the request Host header (spec §4.1, §4.2).
 *
 * `resolveStorefrontByHost` existed but nothing called it, so a storefront
 * subdomain or custom domain had no effect on the server at all.
 *
 * This attaches the resolved storefront to the request and exposes it at
 * GET /api/storefronts/resolve/host, which is what a browser hitting
 * {slug}.userentos.com needs in order to know which storefront it is on.
 *
 * Deliberately non-blocking: an unrecognised host falls through to the normal
 * platform app rather than erroring, so the API keeps working on any hostname.
 */
import type { Request, Response, NextFunction } from 'express'
import { resolveStorefrontByHost } from '../services/storefront.js'
import { Storefront } from '../models/Storefront.js'

declare module 'express-serve-static-core' {
  interface Request {
    /** Set when the request arrived on a storefront subdomain or custom domain. */
    storefrontSlug?: string
  }
}

/** Hostnames that are the platform itself, never a tenant. */
function isPlatformHost(hostname: string): boolean {
  return (
    hostname === 'userentos.com'
    || hostname === 'www.userentos.com'
    || hostname === 'api.userentos.com'
    || hostname.endsWith('localhost')
    || hostname.startsWith('127.')
    || hostname.startsWith('192.168.')
  )
}

export async function storefrontHost(req: Request, res: Response, next: NextFunction): Promise<void> {
  const host = req.headers.host
  if (!host) { next(); return }

  const hostname = host.toLowerCase().split(':')[0]
  if (isPlatformHost(hostname)) { next(); return }

  try {
    const resolved = await resolveStorefrontByHost(hostname)
    if (!resolved) { next(); return }

    req.storefrontSlug = resolved.slug

    // Canonical enforcement (spec §4.1: "Only one canonical storefront URL
    // should be indexed at a time; other domains redirect to the canonical
    // URL"). Without this a storefront reachable on both its subdomain and its
    // custom domain gets indexed twice and splits its own ranking.
    //
    // Only GET/HEAD are redirected: bouncing a POST would drop its body, and
    // an API client posting to a non-canonical host should still be served.
    if (req.method === 'GET' || req.method === 'HEAD') {
      const storefront = await Storefront.findOne({ slug: resolved.slug, status: 'active' })
        .select('canonicalDomain').lean()
      const canonical = storefront?.canonicalDomain

      if (canonical && canonical !== hostname) {
        const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol ?? 'https'
        // 301: the canonical host is a permanent property of the storefront,
        // and a permanent redirect is what consolidates the ranking signal.
        res.redirect(301, `${proto}://${canonical}${req.originalUrl}`)
        return
      }
    }
  } catch {
    // Never let tenant resolution break an ordinary request.
  }
  next()
}

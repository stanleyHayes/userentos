/**
 * /robots.txt per host. Answered here, without calling the API: a failing
 * robots.txt makes search engines stop crawling the whole site.
 */
import { SITE_URL, isPlatformHost, isPreviewHost, requestHost } from './_lib/seo.js'

// Signed-in areas have nothing to index.
const PRIVATE = ['/dashboard', '/settings', '/admin', '/payments', '/agreements', '/documents', '/chat', '/messages', '/website', '/onboarding', '/storefront', '/accept-invite', '/reset-password']

export function GET(request: Request): Response {
  const host = requestHost(request) || new URL(SITE_URL).host
  const lines = isPreviewHost(host)
    ? ['User-agent: *', 'Disallow: /']
    : isPlatformHost(host)
      ? ['User-agent: *', 'Allow: /', ...PRIVATE.map((path) => `Disallow: ${path}`), '', `Sitemap: ${SITE_URL}/sitemap.xml`]
      : ['User-agent: *', 'Allow: /', '', `Sitemap: https://${host}/sitemap.xml`]
  return new Response(`${lines.join('\n')}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
  })
}

// Crawlers and monitors may ask with HEAD; without it the launcher answers 405.
export { GET as HEAD }

/** /sitemap.xml for whichever host asked: the platform's, or an agency website's own. */
import { API_URL, fetchWithTimeout, requestHost } from './_lib/seo.js'

export async function GET(request: Request): Promise<Response> {
  const host = requestHost(request)
  try {
    const response = await fetchWithTimeout(`${API_URL}/seo/sitemap.xml?host=${encodeURIComponent(host)}`, 8000)
    if (response.ok) {
      return new Response(await response.text(), {
        headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400' },
      })
    }
  } catch {
    // Fall through: crawlers retry a 503 later.
  }
  return new Response('Sitemap temporarily unavailable', { status: 503, headers: { 'Retry-After': '600', 'Cache-Control': 'no-store' } })
}

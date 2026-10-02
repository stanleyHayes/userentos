/**
 * The app shell with the page's own metadata (see apps/api/src/services/seo.ts):
 * listings, articles, the main public pages and every page of an agency
 * website. Link previews (WhatsApp, Facebook, X) and search engines see the
 * right title, description and photo without running JavaScript; people get
 * the same single-page app as everywhere else.
 */
import { API_URL, fetchWithTimeout, injectMeta, injectVerification, isPlatformHost, requestHost, shellOrigin, type PageMeta } from './_lib/seo.js'

let cachedShell: { html: string; at: number } | null = null

/**
 * The deployed app shell, app.html (see vite.config.ts), kept for a minute.
 * Always from shellOrigin(), this deployment's own fixed address, so the one
 * cached copy is never anyone else's HTML and the bypass secret (needed to
 * read a protected preview) only ever goes to this deployment.
 */
async function shell(): Promise<string> {
  if (cachedShell && Date.now() - cachedShell.at < 60_000) return cachedShell.html
  const origin = shellOrigin()
  // Only a preview's own deployment URL is behind protection.
  const bypass = process.env.VERCEL_URL && origin === `https://${process.env.VERCEL_URL}` ? process.env.VERCEL_AUTOMATION_BYPASS_SECRET : undefined
  const response = await fetchWithTimeout(`${origin}/app.html`, 3000, bypass ? { headers: { 'x-vercel-protection-bypass': bypass } } : {})
  if (!response.ok) throw new Error(`app.html answered ${response.status}`)
  cachedShell = { html: await response.text(), at: Date.now() }
  return cachedShell.html
}

async function metaFor(host: string, path: string): Promise<PageMeta | null> {
  try {
    const response = await fetchWithTimeout(`${API_URL}/seo/meta?host=${encodeURIComponent(host)}&path=${encodeURIComponent(path)}`, 2500)
    if (!response.ok) return null
    return ((await response.json()) as { data?: PageMeta | null }).data ?? null
  } catch {
    // Without metadata the page still works; the browser sets its own.
    return null
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const host = requestHost(request)
  // A path on this site only: never a scheme or another host.
  const raw = url.searchParams.get('path') || '/'
  const path = raw.startsWith('/') && !raw.startsWith('//') ? raw.slice(0, 512) : '/'

  let html: string
  try {
    html = await shell()
  } catch {
    // Serve the plain app instead (vercel.json skips this function when _shell is set).
    // A relative redirect stays on whichever host was asked.
    const query = new URLSearchParams({ _shell: '1' })
    return new Response(null, { status: 302, headers: { Location: `${path.split('?')[0]}?${query}`, 'Cache-Control': 'no-store' } })
  }

  const meta = host ? await metaFor(host, path) : null
  const page = meta ? injectMeta(html, meta) : html
  // Ownership tags belong to the platform's own pages, never an agent's website.
  return new Response(host && isPlatformHost(host) ? injectVerification(page) : page, {
    status: meta?.status === 404 ? 404 : 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // A missing page may exist a minute later (a listing just approved in a new area), so its 404 is kept briefly.
      'Cache-Control': meta?.status === 404 ? 'public, max-age=0, s-maxage=60' : 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
    },
  })
}

// Uptime monitors and link checkers ask with HEAD; without it the launcher answers 405. Node drops the body.
export { GET as HEAD }

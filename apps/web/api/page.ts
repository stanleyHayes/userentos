/**
 * The app shell with the page's own metadata (see apps/api/src/services/seo.ts):
 * listings, articles, the main public pages and every page of an agency
 * website. Link previews (WhatsApp, Facebook, X) and search engines see the
 * right title, description and photo without running JavaScript; people get
 * the same single-page app as everywhere else.
 */
import { API_URL, fetchWithTimeout, injectMeta, requestHost, type PageMeta } from './_lib/seo.js'

let cachedShell: { html: string; at: number } | null = null

/** The deployed app shell, app.html (see vite.config.ts), kept for a minute. */
async function shell(origin: string): Promise<string> {
  if (cachedShell && Date.now() - cachedShell.at < 60_000) return cachedShell.html
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
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
  const path = url.searchParams.get('path') || '/'
  const origin = `${url.protocol}//${host}`

  let html: string
  try {
    html = await shell(origin)
  } catch {
    // Serve the plain app instead (vercel.json skips this function when _shell is set).
    const fallback = new URL(path, origin)
    fallback.searchParams.set('_shell', '1')
    return Response.redirect(fallback.toString(), 302)
  }

  const meta = await metaFor(host, path)
  return new Response(meta ? injectMeta(html, meta) : html, {
    status: meta?.status === 404 ? 404 : 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
    },
  })
}

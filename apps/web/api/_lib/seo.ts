/**
 * Shared by the page, sitemap and robots functions. Files under api/_lib are
 * not deployed as functions of their own.
 */

/** Mirrors PageMeta in apps/api/src/services/seo.ts. */
export interface PageMeta {
  title: string
  description: string
  canonical: string
  image: string
  type: 'website' | 'article'
  siteName: string
  noindex: boolean
  status: 200 | 404
  jsonLd: Record<string, unknown>[]
  replaceSiteJsonLd: boolean
}

export const API_URL = (process.env.SEO_API_URL || process.env.VITE_API_URL || 'https://api.userentos.com/api').replace(/\/$/, '')
export const SITE_URL = (process.env.VITE_SITE_URL || 'https://userentos.com').replace(/\/$/, '')

export function requestHost(request: Request): string {
  const raw = request.headers.get('x-forwarded-host') || request.headers.get('host') || new URL(request.url).host
  return raw.split(',')[0].trim().toLowerCase()
}

/** userentos.com and www: the platform itself, not an agency website. */
export function isPlatformHost(host: string): boolean {
  const name = host.split(':')[0]
  const platform = new URL(SITE_URL).hostname
  return name === platform || name === `www.${platform}` || name === 'localhost'
}

export const isPreviewHost = (host: string) => host.split(':')[0].endsWith('.vercel.app')

export function fetchWithTimeout(url: string, ms: number, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms) })
}

const attr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const text = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Replace the first tag matching `pattern`, or add `tag` before </head>. */
function upsert(html: string, pattern: RegExp, tag: string): string {
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace('</head>', `  ${tag}\n  </head>`)
}

/** The browser replaces structured data by these ids (setJsonLd in src/lib/seo.ts), so it never appears twice. */
const LD_IDS: Record<string, string> = { RealEstateListing: 'listing', BlogPosting: 'article', RealEstateAgent: 'site-org' }

/** Put a page's own title, description, image, canonical address and structured data into the app shell. */
export function injectMeta(html: string, meta: PageMeta): string {
  let out = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${text(meta.title)}</title>`)
  const name = (key: string, value: string) => { out = upsert(out, new RegExp(`<meta\\s+name="${key}"[^>]*>`), `<meta name="${key}" content="${attr(value)}" />`) }
  const property = (key: string, value: string) => { out = upsert(out, new RegExp(`<meta\\s+property="${key}"[^>]*>`), `<meta property="${key}" content="${attr(value)}" />`) }
  const itemprop = (key: string, value: string) => { out = upsert(out, new RegExp(`<meta\\s+itemprop="${key}"[^>]*>`), `<meta itemprop="${key}" content="${attr(value)}" />`) }

  name('description', meta.description)
  property('og:type', meta.type)
  property('og:url', meta.canonical)
  property('og:title', meta.title)
  property('og:description', meta.description)
  property('og:image', meta.image)
  property('og:image:alt', meta.title)
  property('og:site_name', meta.siteName)
  name('twitter:url', meta.canonical)
  name('twitter:title', meta.title)
  name('twitter:description', meta.description)
  name('twitter:image', meta.image)
  name('twitter:image:alt', meta.title)
  itemprop('name', meta.title)
  itemprop('description', meta.description)
  itemprop('image', meta.image)
  // The shell declares the size and type of the default card image; a listing photo is neither.
  if (!meta.image.endsWith('/og-image.png')) {
    out = out.replace(/\s*<meta\s+property="og:image:(type|width|height)"[^>]*>/g, '')
  }
  out = upsert(out, /<link\s+rel="canonical"[^>]*>/, `<link rel="canonical" href="${attr(meta.canonical)}" />`)
  out = upsert(out, /<meta\s+name="robots"[^>]*>/, `<meta name="robots" content="${meta.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large'}" />`)

  if (meta.replaceSiteJsonLd) out = out.replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/, '')
  for (const data of meta.jsonLd) {
    const id = LD_IDS[String(data['@type'])] ?? 'page'
    // "<" is escaped so a title containing </script> cannot end the tag early.
    out = out.replace('</head>', `  <script type="application/ld+json" data-seo="${id}">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>\n  </head>`)
  }
  return out
}

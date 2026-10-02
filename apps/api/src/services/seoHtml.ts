/**
 * The HTML a public page is served with before the app's JavaScript runs.
 *
 * Search engines rank what they can read in the first response; a bare app
 * shell gives them a title and nothing else. The page renderer
 * (apps/web/api/page.ts) puts this markup inside #root, where the app reuses
 * it as its loading state and then replaces it with the full page, so
 * visitors see the same content straight away and crawlers read it all.
 *
 * Everything here is user content, so every value is escaped and only http(s)
 * links and images are emitted.
 */

export const esc = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** A link target we are willing to emit: same-site paths and http(s) only. */
export function safeHref(url: string | null | undefined): string | null {
  const value = (url ?? '').trim()
  if (/^\/(?!\/)/.test(value)) return value
  return /^https?:\/\/[^\s"'<>]+$/i.test(value) ? value : null
}

const ghs = new Intl.NumberFormat('en-GH', { maximumFractionDigits: 0 })
/** "GHS 2,500", as the listing cards print it (formatListingPrice in packages/shared/listingTypes.ts). */
export const money = (amount: number) => `GHS ${ghs.format(Number.isFinite(amount) ? amount : 0)}`

export interface Crumb { name: string; path: string }
export interface CardListing { path: string; title: string; place: string; price: string; facts: string; image?: string | null }
export interface LinkItem { label: string; path: string; count?: number }

const STYLE = `<style>
.ssr{font-family:'DM Sans',system-ui,-apple-system,'Segoe UI',sans-serif;color:#0f172a;background:#f6f8fb;min-height:100vh;line-height:1.55}
.ssr a{color:#1e3a5f;text-decoration:none}.ssr a:hover{text-decoration:underline}
.ssr-wrap{max-width:1120px;margin:0 auto;padding:0 20px}
.ssr-top{background:#0f1f33}.ssr-top nav{display:flex;flex-wrap:wrap;align-items:center;gap:6px 18px;padding:14px 0}
.ssr-top a{color:#fff;font-weight:600;font-size:14px}.ssr-top .ssr-brand{font-size:20px;font-weight:800;margin-right:auto}.ssr-brand b{color:#f59e0b}
.ssr-hero{background:linear-gradient(135deg,#0f1f33,#1e3a5f);color:#fff;padding:34px 0 30px}
.ssr h1{font-family:Fraunces,Georgia,serif;font-size:clamp(28px,4vw,44px);line-height:1.12;margin:10px 0 12px;font-weight:800;color:inherit}
.ssr-hero p{color:rgba(255,255,255,.78);max-width:780px;margin:0 0 10px;font-size:16px}
.ssr-crumbs{font-size:13px;color:rgba(255,255,255,.62);list-style:none;display:flex;flex-wrap:wrap;gap:6px;padding:0;margin:0}
.ssr-crumbs li+li:before{content:'›';margin-right:6px}.ssr-crumbs a{color:rgba(255,255,255,.88)}
.ssr-facts{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0;margin:14px 0 0}.ssr-facts li{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16);padding:5px 12px;border-radius:999px;font-size:13px}
.ssr main{padding:26px 0 44px}
.ssr h2{font-family:Fraunces,Georgia,serif;font-size:22px;line-height:1.25;margin:30px 0 12px}
.ssr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px;list-style:none;padding:0;margin:0}
.ssr-card{display:block;height:100%;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;color:inherit}
.ssr-card img{width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;display:block;background:#e2e8f0}
.ssr-card div{padding:12px 14px}.ssr-card strong{display:block;font-size:15px;color:#0f172a}.ssr-card span{display:block;font-size:13px;color:#64748b}.ssr-card .ssr-price{color:#1e3a5f;font-weight:800;font-size:15px;margin-top:4px}
.ssr-chips{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0;margin:0}.ssr-chips a{display:inline-block;padding:7px 13px;border-radius:999px;background:#fff;border:1px solid #e2e8f0;font-size:13px;font-weight:600}
.ssr-table{border-collapse:collapse;width:100%;max-width:560px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;font-size:14px}.ssr-table th,.ssr-table td{text-align:left;padding:9px 12px;border-bottom:1px solid #e2e8f0}
.ssr details{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 16px;margin:8px 0;max-width:820px}.ssr summary{font-weight:700;cursor:pointer}.ssr details p{margin:8px 0 0}
.ssr article{max-width:780px}.ssr article p,.ssr article li{font-size:16px;line-height:1.75}.ssr article img{max-width:100%;border-radius:12px}
.ssr-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}.ssr-gallery img{width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;border-radius:14px;background:#e2e8f0}
.ssr-muted{color:#64748b}.ssr-foot{background:#070b14;color:rgba(255,255,255,.66);padding:26px 0;font-size:13px}.ssr-foot a{color:rgba(255,255,255,.82)}.ssr-foot h2{color:#fff;font-size:15px;margin:0 0 10px}
.ssr-foot ul{list-style:none;padding:0;margin:0 0 18px;display:flex;flex-wrap:wrap;gap:6px 16px}
</style>`

const PLATFORM_NAV: LinkItem[] = [
  { label: 'Properties', path: '/registry' },
  { label: 'For rent', path: '/rent' },
  { label: 'For sale', path: '/buy' },
  { label: 'Short stays', path: '/short-stay' },
  { label: 'Blog', path: '/blog' },
  { label: 'Rental laws', path: '/rental-laws' },
]

export function crumbsHtml(crumbs: Crumb[]): string {
  if (crumbs.length < 2) return ''
  return `<ol class="ssr-crumbs" aria-label="Breadcrumb">${crumbs.map((c, i) => `<li>${i === crumbs.length - 1 ? esc(c.name) : `<a href="${esc(c.path)}">${esc(c.name)}</a>`}</li>`).join('')}</ol>`
}

export function cardsHtml(listings: CardListing[]): string {
  if (!listings.length) return ''
  return `<ul class="ssr-grid">${listings.map((l) => {
    const image = safeHref(l.image)
    return `<li><a class="ssr-card" href="${esc(l.path)}">${image ? `<img src="${esc(image)}" alt="${esc(`${l.title}, ${l.place}`)}" loading="lazy" width="400" height="300">` : ''}<div><strong>${esc(l.title)}</strong><span>${esc(l.place)}</span><span>${esc(l.facts)}</span><span class="ssr-price">${esc(l.price)}</span></div></a></li>`
  }).join('')}</ul>`
}

export function chipsHtml(links: LinkItem[]): string {
  if (!links.length) return ''
  return `<ul class="ssr-chips">${links.map((l) => `<li><a href="${esc(l.path)}">${esc(l.label)}${l.count !== undefined ? ` (${l.count})` : ''}</a></li>`).join('')}</ul>`
}

export function faqHtml(faq: { q: string; a: string }[]): string {
  return faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')
}

export function heroHtml(opts: { crumbs?: Crumb[]; title: string; paragraphs?: string[]; facts?: string[] }): string {
  return `<section class="ssr-hero"><div class="ssr-wrap">${crumbsHtml(opts.crumbs ?? [])}<h1>${esc(opts.title)}</h1>${(opts.paragraphs ?? []).map((p) => `<p>${esc(p)}</p>`).join('')}${opts.facts?.length ? `<ul class="ssr-facts">${opts.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}</div></section>`
}

/** The platform's page frame: header navigation, the page, and a footer of popular searches. */
export function platformPage(content: string, popular: LinkItem[] = []): string {
  const nav = PLATFORM_NAV.map((l) => `<a href="${l.path}">${esc(l.label)}</a>`).join('')
  const foot = `<footer class="ssr-foot"><div class="ssr-wrap">${popular.length ? `<h2>Popular searches</h2><ul>${popular.map((l) => `<li><a href="${esc(l.path)}">${esc(l.label)}</a></li>`).join('')}</ul>` : ''}<ul>${PLATFORM_NAV.map((l) => `<li><a href="${l.path}">${esc(l.label)}</a></li>`).join('')}<li><a href="/register">Create a free account</a></li><li><a href="/support">Support</a></li></ul><p>© ${new Date().getFullYear()} RentOS Ghana. Verified homes to rent and buy across Ghana.</p></div></footer>`
  return `${STYLE}<div class="ssr"><header class="ssr-top"><div class="ssr-wrap"><nav aria-label="RentOS"><a class="ssr-brand" href="/">Rent<b>OS</b></a>${nav}</nav></div></header>${content}${foot}</div>`
}

/** An agent's website frame: its own name and pages. */
export function sitePage(site: { name: string; home: string }, content: string): string {
  const pages: LinkItem[] = [{ label: 'Home', path: '/' }, { label: 'Properties', path: '/properties' }, { label: 'About', path: '/about' }, { label: 'News', path: '/news' }, { label: 'Contact', path: '/contact' }]
  const nav = pages.map((p) => `<a href="${p.path}">${esc(p.label)}</a>`).join('')
  return `${STYLE}<div class="ssr"><header class="ssr-top"><div class="ssr-wrap"><nav aria-label="${esc(site.name)}"><a class="ssr-brand" href="/">${esc(site.name)}</a>${nav}</nav></div></header>${content}<footer class="ssr-foot"><div class="ssr-wrap"><p>© ${new Date().getFullYear()} ${esc(site.name)} · Website by <a href="https://www.userentos.com/">RentOS</a></p></div></footer></div>`
}

export const section = (title: string, body: string) => body ? `<h2>${esc(title)}</h2>${body}` : ''
export const main = (body: string) => `<main><div class="ssr-wrap">${body}</div></main>`

/** An address back from esc(): quotes and angle brackets percent-encoded (safeHref refuses them raw), ampersands restored. */
const unescapeUrl = (url: string) => url.replace(/&#39;/g, '%27').replace(/&quot;/g, '%22').replace(/&lt;/g, '%3C').replace(/&gt;/g, '%3E').replace(/&amp;/g, '&')

function inline(text: string): string {
  // Escaped first; the patterns below only ever add tags around escaped text.
  // No '[' inside a label or an address: each attempt then stops at the next '[',
  // which keeps a post full of brackets linear instead of quadratic.
  let out = esc(text)
  out = out.replace(/!\[([^[\]]*)\]\(([^)\s[]+)\)/g, (_m, alt: string, url: string) => {
    const href = safeHref(unescapeUrl(url))
    return href ? `<img src="${esc(href)}" alt="${alt}" loading="lazy">` : ''
  })
  out = out.replace(/\[([^[\]]+)\]\(([^)\s[]+)\)/g, (_m, label: string, url: string) => {
    const href = safeHref(unescapeUrl(url))
    return href ? `<a href="${esc(href)}">${label}</a>` : label
  })
  return out
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

/** A small, safe Markdown renderer for article bodies: headings, lists, quotes, links, images, emphasis. */
export function markdownHtml(markdown: string): string {
  const blocks = (markdown ?? '').replace(/\r\n?/g, '\n').split(/\n{2,}/)
  return blocks.map((block) => {
    const lines = block.split('\n').filter((l) => l.trim())
    if (!lines.length) return ''
    // dotAll: '.' must match U+2028/U+2029 as \s does, or a long heading backtracks quadratically.
    const heading = /^(#{1,6})\s+(.*)$/s.exec(lines[0])
    if (heading && lines.length === 1) {
      // The page title is the only <h1>.
      const level = Math.min(6, Math.max(2, heading[1].length + 1))
      return `<h${level}>${inline(heading[2])}</h${level}>`
    }
    if (lines.every((l) => /^\s*[-*+]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*+]\s+/, ''))}</li>`).join('')}</ul>`
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`
    if (lines.every((l) => /^\s*>/.test(l))) return `<blockquote><p>${inline(lines.map((l) => l.replace(/^\s*>\s?/, '')).join(' '))}</p></blockquote>`
    return `<p>${lines.map(inline).join('<br>')}</p>`
  }).join('\n')
}

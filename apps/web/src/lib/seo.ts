/**
 * Document-head SEO for a single-page app (spec §4.1).
 *
 * index.html ships one static set of tags for the marketing site, so every
 * route — including a seller's storefront on its own domain — was served the
 * platform's title, description and canonical URL. These helpers rewrite the
 * head per route.
 *
 * They mutate document.head directly rather than going through a helmet-style
 * library: the app has no SSR, so the crawler-visible head is whatever the
 * last render left behind, and one small module is cheaper than a dependency.
 */

function upsert(selector: string, create: () => HTMLElement): HTMLElement {
  let el = document.head.querySelector(selector) as HTMLElement | null
  if (!el) {
    el = create()
    document.head.appendChild(el)
  }
  return el
}

/** Set a `<meta name="...">` tag, creating it if the page lacks one. */
export function setMeta(name: string, content: string): void {
  const el = upsert(`meta[name="${name}"]`, () => {
    const m = document.createElement('meta')
    m.setAttribute('name', name)
    return m
  })
  el.setAttribute('content', content)
}

/** Set a `<meta property="og:...">` tag, creating it if the page lacks one. */
export function setOgMeta(property: string, content: string): void {
  const el = upsert(`meta[property="${property}"]`, () => {
    const m = document.createElement('meta')
    m.setAttribute('property', property)
    return m
  })
  el.setAttribute('content', content)
}

/**
 * Point `rel=canonical` at `url`.
 *
 * A storefront is reachable at /s/{slug}, {slug}.userentos.com and any custom
 * domain attached to it. Without this every one of those is a separate
 * indexable URL for the same content, which splits the storefront's own
 * ranking between its addresses.
 */
export function setCanonical(url: string): void {
  const el = upsert('link[rel="canonical"]', () => {
    const l = document.createElement('link')
    l.setAttribute('rel', 'canonical')
    return l
  })
  el.setAttribute('href', url)
}

/**
 * Ask crawlers to skip this URL, or stop asking.
 *
 * Used on the non-canonical address of a storefront: the server 301s a real
 * crawler, but a client-side route change never reaches the server, so the
 * tag is what keeps the duplicate out of the index.
 */
export function setNoIndex(noIndex: boolean): void {
  const existing = document.head.querySelector('meta[name="robots"]')
  if (!noIndex) {
    existing?.remove()
    return
  }
  setMeta('robots', 'noindex, follow')
}

export interface SeoTags {
  title: string
  description?: string
  canonical?: string
  image?: string
  siteName?: string
  noIndex?: boolean
}

/** Apply a full set of head tags in one call. */
export function applySeo(tags: SeoTags): void {
  document.title = tags.title
  setOgMeta('og:title', tags.title)
  setMeta('twitter:title', tags.title)
  setMeta('twitter:card', 'summary_large_image')

  if (tags.description) {
    setMeta('description', tags.description)
    setOgMeta('og:description', tags.description)
    setMeta('twitter:description', tags.description)
  }
  if (tags.canonical) {
    setCanonical(tags.canonical)
    setOgMeta('og:url', tags.canonical)
    setMeta('twitter:url', tags.canonical)
  }
  if (tags.image) {
    setOgMeta('og:image', tags.image)
    setMeta('twitter:image', tags.image)
  }
  if (tags.siteName) setOgMeta('og:site_name', tags.siteName)

  setNoIndex(tags.noIndex === true)
}

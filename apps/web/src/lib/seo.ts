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

import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { platformOrigin } from './platformOrigin'

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
  /** og:type; "website" when omitted. */
  type?: 'website' | 'article'
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
  setOgMeta('og:type', tags.type ?? 'website')

  setNoIndex(tags.noIndex === true)
}

/**
 * schema.org structured data (JSON-LD) for this route, replacing whatever the
 * previous route left under the same id; null removes it. Lets search engines
 * show a listing's price and photos, or an article's author, in results.
 */
export function setJsonLd(id: string, data: Record<string, unknown> | null): void {
  const existing = document.head.querySelector(`script[type="application/ld+json"][data-seo="${id}"]`)
  if (!data) {
    existing?.remove()
    return
  }
  const el = existing ?? (() => {
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.dataset.seo = id
    document.head.appendChild(script)
    return script
  })()
  // "<" is escaped so a title containing </script> cannot end the tag early.
  el.textContent = JSON.stringify(data).replace(/</g, '\\u003c')
}

/** The platform's default title and description; index.html carries the same. */
export const DEFAULT_SEO = {
  title: 'RentOS Ghana: houses and apartments to rent and buy in Ghana',
  description: 'Find verified houses, apartments and short stays to rent or buy across Ghana. Message agents safely, sign tenancy agreements online and keep your rent records in one place.',
}

/** Public pages with their own title (kept in step with PLATFORM_PAGES in apps/api/src/services/seo.ts). */
const PAGE_SEO: Record<string, { title: string; description: string }> = {
  '/properties': { title: 'Houses and apartments for rent and sale in Ghana | RentOS', description: 'Browse verified houses, apartments, rooms and short stays to rent or buy across Accra, Kumasi, Tema, Takoradi and the rest of Ghana.' },
  '/registry': { title: 'Property registry: verified listings in Ghana | RentOS', description: 'Search reviewed rental and sale listings across Ghana by city, price and property type, each with its own shareable page.' },
  '/blog': { title: 'RentOS Real Estate News: property news and guides for Ghana', description: 'Rental guides from RentOS and market news from agents and agencies across Ghana: prices, tenancy law, deposits and buying tips.' },
  '/rental-laws': { title: 'Ghana rental laws explained: tenant and landlord rights | RentOS', description: 'Plain-language guide to the Rent Act 1963 (Act 220), rent advance limits, deposits, evictions and the Rent Control Department.' },
}

/**
 * Every route starts from the platform defaults with its own canonical
 * address; a page with something better to say (a listing, an article, a
 * website) then sets its own in its effects. The shell used to name the home
 * page as canonical for every route, which told search engines that pages
 * like /blog and /rental-laws were copies of it.
 *
 * Call it from a component rendered before the routes, so it runs first.
 */
export function useRouteSeoDefaults(): void {
  const { pathname } = useLocation()
  useEffect(() => {
    const path = pathname.replace(/\/+$/, '') || '/'
    const page = PAGE_SEO[path] ?? DEFAULT_SEO
    applySeo({ ...page, canonical: `${platformOrigin()}${path === '/' ? '/' : path}`, image: `${platformOrigin()}/og-image.png`, siteName: 'RentOS Ghana' })
  }, [pathname])
}

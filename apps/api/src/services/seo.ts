/**
 * Search and link-preview metadata for public pages, served to the web app's
 * page renderer (apps/web/api/page.ts) so a listing, an article or an agency
 * website shows its own title, description and photo before any JavaScript
 * runs: WhatsApp, Facebook and X never run it, and search engines index the
 * first HTML they get far sooner than a rendered page.
 *
 * Also builds each host's sitemap: the platform's own pages, listings and
 * RentOS articles, and for a website its pages and news.
 */
import { BlogPost } from '../models/BlogPost.js'
import { Property } from '../models/Property.js'
import { Storefront } from '../models/Storefront.js'
import { PUBLICLY_VISIBLE_STATUSES } from './propertyReview.js'
import { closedAccountIds, isClosedAccount } from './closedAccounts.js'
import { normalizeListingRef } from './listings.js'
import { resolveStorefrontByHost, storefrontUrl } from './storefront.js'
import { publicBaseUrl } from '../utils/env.js'

export interface PageMeta {
  title: string
  description: string
  canonical: string
  image: string
  type: 'website' | 'article'
  siteName: string
  noindex: boolean
  /** 404 for a listing, article or website that does not exist (or is not public). */
  status: 200 | 404
  /** Page-specific structured data. */
  jsonLd: Record<string, unknown>[]
  /** On an agency website the RentOS organisation data does not describe the page. */
  replaceSiteJsonLd: boolean
}

const PLATFORM_NAME = 'RentOS Ghana'
const MAX_DESCRIPTION = 160

const TYPE_LABELS: Record<string, string> = {
  apartment: 'Apartment', house: 'House', studio: 'Studio', townhouse: 'Townhouse', room: 'Room',
  shared_room: 'Shared room', hostel: 'Hostel', commercial: 'Commercial space', warehouse: 'Warehouse',
}
const SCHEMA_TYPES: Record<string, string> = { apartment: 'Apartment', studio: 'Apartment', house: 'SingleFamilyResidence', townhouse: 'House', room: 'Room', shared_room: 'Room', hostel: 'Accommodation', commercial: 'Place', warehouse: 'Place' }
const PRICE_SUFFIX: Record<string, string> = { rent: '/month', short_let: '/night', sale: '' }
const PURPOSE: Record<string, string> = { rent: 'for rent', sale: 'for sale', short_let: 'short let' }

/** The platform's static, indexable pages (also its sitemap). */
export const PLATFORM_PAGES: { path: string; priority: string; changefreq: string; title?: string; description?: string }[] = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/properties', priority: '0.9', changefreq: 'daily', title: 'Houses and apartments for rent and sale in Ghana | RentOS', description: 'Browse verified houses, apartments, rooms and short stays to rent or buy across Accra, Kumasi, Tema, Takoradi and the rest of Ghana.' },
  { path: '/registry', priority: '0.8', changefreq: 'daily', title: 'Property registry: verified listings in Ghana | RentOS', description: 'Search reviewed rental and sale listings across Ghana by city, price and property type, each with its own shareable page.' },
  { path: '/blog', priority: '0.8', changefreq: 'daily', title: 'RentOS Real Estate News: property news and guides for Ghana', description: 'Rental guides from RentOS and market news from agents and agencies across Ghana: prices, tenancy law, deposits and buying tips.' },
  { path: '/rental-laws', priority: '0.7', changefreq: 'monthly', title: 'Ghana rental laws explained: tenant and landlord rights | RentOS', description: 'Plain-language guide to the Rent Act 1963 (Act 220), rent advance limits, deposits, evictions and the Rent Control Department.' },
  { path: '/developments', priority: '0.6', changefreq: 'weekly' },
  { path: '/support', priority: '0.4', changefreq: 'monthly' },
  { path: '/register', priority: '0.5', changefreq: 'yearly' },
  { path: '/login', priority: '0.4', changefreq: 'yearly' },
  { path: '/privacy', priority: '0.3', changefreq: 'yearly' },
  { path: '/terms', priority: '0.3', changefreq: 'yearly' },
  { path: '/data-protection', priority: '0.3', changefreq: 'yearly' },
]

const SITE_PAGES: Record<string, string> = { '': '', properties: 'Properties', about: 'About', news: 'News', contact: 'Contact' }

const clip = (text: string, max = MAX_DESCRIPTION) => {
  const flat = text.replace(/[#*_>`[\]]/g, '').replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).replace(/\s+\S*$/, '')}…`
}

const price = (amount: number, listingType: string) =>
  `GH₵ ${(Number.isFinite(amount) ? amount : 0).toLocaleString('en-GH', { maximumFractionDigits: 0 })}${PRICE_SUFFIX[listingType] ?? '/month'}`

function platformDefaults(): PageMeta {
  const base = publicBaseUrl()
  return {
    title: 'RentOS Ghana: houses and apartments to rent and buy in Ghana',
    description: 'Find verified houses, apartments and short stays to rent or buy across Ghana. Message agents safely, sign tenancy agreements online and keep your rent records in one place.',
    canonical: `${base}/`,
    image: `${base}/og-image.png`,
    type: 'website',
    siteName: PLATFORM_NAME,
    noindex: false,
    status: 200,
    jsonLd: [],
    replaceSiteJsonLd: false,
  }
}

const notFound = (meta: PageMeta, what: string): PageMeta => ({ ...meta, title: `${what} not found | RentOS`, noindex: true, status: 404, jsonLd: [] })

async function publicListing(key: string) {
  const ref = normalizeListingRef(key)
  const match = /^[a-f0-9]{24}$/i.test(key) ? { _id: key } : ref ? { listingRef: ref } : null
  if (!match) return null
  const doc = await Property.findOne({ ...match, listingStatus: { $in: PUBLICLY_VISIBLE_STATUSES } })
    .select('title description images listingRef listingType type address rentAmount bedrooms bathrooms status publishedAt landlordId').lean()
  if (!doc || await isClosedAccount(doc.landlordId)) return null
  return doc
}

async function listingMeta(key: string, base: PageMeta, site?: SiteRecord): Promise<PageMeta> {
  const doc = await publicListing(key)
  if (!doc) return notFound(base, 'Property')
  const listingType = doc.listingType ?? 'rent'
  const typeLabel = TYPE_LABELS[doc.type ?? ''] ?? 'Property'
  const purpose = PURPOSE[listingType] ?? 'for rent'
  const city = doc.address?.city || 'Ghana'
  const place = [doc.address?.neighborhood, doc.address?.city].filter(Boolean).join(', ') || 'Ghana'
  const canonical = `${publicBaseUrl()}/property/${(doc.listingRef ?? String(doc._id)).toLowerCase()}`
  const images = (doc.images ?? []).map(String)
  const beds = doc.bedrooms ? `, ${doc.bedrooms} bedroom${doc.bedrooms === 1 ? '' : 's'}` : ''
  return {
    ...base,
    title: site ? `${doc.title} · ${site.name}` : `${doc.title}: ${typeLabel} ${purpose} in ${city} | RentOS`,
    description: clip(`${typeLabel} ${purpose} in ${place}: ${price(doc.rentAmount ?? 0, listingType)}${beds}. ${doc.description ?? ''}`),
    canonical,
    image: images[0] ?? base.image,
    jsonLd: [{
      '@context': 'https://schema.org',
      '@type': 'RealEstateListing',
      name: doc.title,
      description: clip(doc.description ?? '', 500),
      url: canonical,
      ...(images.length ? { image: images.slice(0, 6) } : {}),
      ...(doc.publishedAt ? { datePosted: new Date(doc.publishedAt).toISOString() } : {}),
      offers: {
        '@type': 'Offer',
        price: doc.rentAmount ?? 0,
        priceCurrency: 'GHS',
        availability: doc.status === 'available' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        businessFunction: listingType === 'sale' ? 'http://purl.org/goodrelations/v1#Sell' : 'http://purl.org/goodrelations/v1#LeaseOut',
      },
      about: {
        '@type': SCHEMA_TYPES[doc.type ?? ''] ?? 'Accommodation',
        ...(doc.bedrooms ? { numberOfRooms: doc.bedrooms } : {}),
        ...(doc.bathrooms ? { numberOfBathroomsTotal: doc.bathrooms } : {}),
        address: { '@type': 'PostalAddress', addressLocality: doc.address?.city || undefined, addressRegion: doc.address?.region || undefined, addressCountry: 'GH' },
      },
    }],
  }
}

type SiteRecord = { _id: unknown; slug: string; name: string; tagline?: string; about?: string; heroSubtitle?: string; canonicalDomain?: string | null; branding?: { logoUrl?: string; coverUrl?: string }; contact?: { city?: string }; serviceAreas?: string[]; published?: boolean }

async function visibleSites(): Promise<string[]> {
  const hidden = await Storefront.find({ $or: [{ status: { $ne: 'active' } }, { published: false }] }).select('_id').lean()
  return hidden.map((s) => String(s._id))
}

/** A RentOS article, or a website post if it is live. */
async function articleMeta(slug: string, base: PageMeta): Promise<PageMeta> {
  const post = await BlogPost.findOne({ slug, published: true }).select('title excerpt coverImage slug storefrontId platform status createdAt updatedAt publishedAt').lean()
  if (!post) return notFound(base, 'Article')
  let site: SiteRecord | null = null
  if (post.storefrontId) {
    if (post.status !== 'published' || (await visibleSites()).includes(post.storefrontId)) return notFound(base, 'Article')
    site = await Storefront.findById(post.storefrontId).select('slug name canonicalDomain branding').lean() as SiteRecord | null
    if (!site) return notFound(base, 'Article')
  }
  // A website's post is indexed on the website; this copy credits it.
  const canonical = site ? `${storefrontUrl(site)}/news/${post.slug}` : `${publicBaseUrl()}/article/${post.slug}`
  return {
    ...base,
    title: `${post.title} | RentOS Real Estate News`,
    description: clip(post.excerpt || post.title),
    canonical,
    image: post.coverImage || base.image,
    type: 'article',
    jsonLd: [articleLd(post, canonical, site ? { name: site.name, url: storefrontUrl(site) } : { name: 'RentOS', url: publicBaseUrl() })],
  }
}

function articleLd(post: { title: string; excerpt?: string; coverImage?: string; createdAt?: Date; updatedAt?: Date; publishedAt?: Date }, canonical: string, author: { name: string; url: string }) {
  const published = (post.publishedAt ?? post.createdAt)
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    ...(post.excerpt ? { description: post.excerpt } : {}),
    ...(post.coverImage ? { image: [post.coverImage] } : {}),
    ...(published ? { datePublished: new Date(published).toISOString() } : {}),
    ...(post.updatedAt ? { dateModified: new Date(post.updatedAt).toISOString() } : {}),
    mainEntityOfPage: canonical,
    author: { '@type': 'Organization', name: author.name, url: author.url },
    publisher: { '@type': 'Organization', name: 'RentOS', url: publicBaseUrl(), logo: { '@type': 'ImageObject', url: `${publicBaseUrl()}/email/rentos-mark.png` } },
  }
}

/**
 * A website's pages. `onHost` is true on <slug>.userentos.com or a custom
 * domain; on the platform the same pages live under /s/<slug>.
 */
async function siteMeta(site: SiteRecord, rest: string[], host: string, onHost: boolean): Promise<PageMeta> {
  const home = storefrontUrl(site)
  const onCanonicalHost = home === `https://${host}`
  const base: PageMeta = {
    ...platformDefaults(),
    siteName: site.name,
    image: site.branding?.coverUrl || site.branding?.logoUrl || platformDefaults().image,
    // Drafts and duplicate addresses (the subdomain once a custom domain is set) stay out of search.
    noindex: site.published === false || (onHost && !onCanonicalHost),
    replaceSiteJsonLd: onHost,
  }
  const [page = '', detail] = rest

  if (page === 'property' && detail) return listingMeta(detail, base, site)
  if (page === 'news' && detail) {
    const post = await BlogPost.findOne({ slug: detail, storefrontId: String(site._id), status: 'published', published: true }).select('title excerpt coverImage slug createdAt updatedAt publishedAt').lean()
    if (!post) return notFound(base, 'Post')
    const canonical = `${home}/news/${post.slug}`
    return { ...base, title: `${post.title} · ${site.name}`, description: clip(post.excerpt || post.title), canonical, image: post.coverImage || base.image, type: 'article', jsonLd: [articleLd(post, canonical, { name: site.name, url: home })] }
  }
  if (!(page in SITE_PAGES) || detail) return { ...base, title: site.name, canonical: home, noindex: true, status: 404 }

  const label = SITE_PAGES[page]
  return {
    ...base,
    title: label ? `${label} · ${site.name}` : site.tagline ? `${site.name}: ${site.tagline}` : site.name,
    description: clip(site.heroSubtitle || site.about || site.tagline || `Homes to rent and buy from ${site.name}.`),
    canonical: `${home}${page ? `/${page}` : ''}`,
    jsonLd: [{
      '@context': 'https://schema.org',
      '@type': 'RealEstateAgent',
      name: site.name,
      url: home,
      ...(site.branding?.logoUrl ? { logo: site.branding.logoUrl, image: site.branding.coverUrl || site.branding.logoUrl } : {}),
      ...(site.about ? { description: clip(site.about, 300) } : {}),
      ...(site.contact?.city ? { address: { '@type': 'PostalAddress', addressLocality: site.contact.city, addressCountry: 'GH' } } : {}),
      ...(site.serviceAreas?.length ? { areaServed: site.serviceAreas } : {}),
    }],
  }
}

const SITE_FIELDS = 'slug name tagline about heroSubtitle canonicalDomain branding contact serviceAreas published status'

const platformHostname = () => new URL(publicBaseUrl()).hostname

/** Is this the platform itself (userentos.com, www, a preview or local host)? */
function isPlatformHost(host: string): boolean {
  const name = host.split(':')[0]
  return name === platformHostname() || name === `www.${platformHostname()}` || name === 'localhost' || name.endsWith('.vercel.app')
}

async function siteForHost(host: string): Promise<SiteRecord | null> {
  if (isPlatformHost(host)) return null
  const resolved = await resolveStorefrontByHost(host)
  return resolved ? await Storefront.findOne({ slug: resolved.slug, status: 'active' }).select(SITE_FIELDS).lean() as SiteRecord | null : null
}

/** Metadata for one page; null when the page sets its own in the browser and the defaults will do. */
export async function pageMeta(rawHost: string, rawPath: string): Promise<PageMeta | null> {
  const host = rawHost.trim().toLowerCase()
  const path = `/${rawPath.split(/[?#]/)[0].split('/').filter(Boolean).map(decodeURIComponent).join('/')}`
  const parts = path.split('/').filter(Boolean)

  const site = await siteForHost(host)
  if (site) return siteMeta(site, parts, host, true)
  if (!isPlatformHost(host)) return { ...platformDefaults(), title: 'Website not found | RentOS', noindex: true, status: 404 }

  const base = platformDefaults()
  // Preview deployments are never indexed.
  if (host.endsWith('.vercel.app')) base.noindex = true
  const [first, second] = parts
  if ((first === 'property' || first === 'registry') && second) return listingMeta(second, base)
  if (first === 'article' && second) return articleMeta(second, base)
  if (first === 's' && second) {
    const record = await Storefront.findOne({ slug: second.toLowerCase(), status: 'active' }).select(SITE_FIELDS).lean() as SiteRecord | null
    return record ? siteMeta(record, parts.slice(2), host, false) : notFound(base, 'Website')
  }
  const page = PLATFORM_PAGES.find((p) => p.path === path)
  if (page) return { ...base, canonical: `${publicBaseUrl()}${page.path === '/' ? '/' : page.path}`, ...(page.title ? { title: page.title } : {}), ...(page.description ? { description: page.description } : {}) }
  return null
}

/** Schemas get updatedAt from timestamps: true, which their interfaces do not declare. */
const updatedAt = (doc: object) => (doc as { updatedAt?: Date }).updatedAt

const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function urlset(urls: { loc: string; lastmod?: Date; changefreq?: string; priority?: string }[]): string {
  const body = urls.map((u) => [
    '  <url>',
    `    <loc>${escapeXml(u.loc)}</loc>`,
    u.lastmod ? `    <lastmod>${u.lastmod.toISOString().slice(0, 10)}</lastmod>` : '',
    u.changefreq ? `    <changefreq>${u.changefreq}</changefreq>` : '',
    u.priority ? `    <priority>${u.priority}</priority>` : '',
    '  </url>',
  ].filter(Boolean).join('\n')).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}

/** Sitemaps hold at most 50,000 addresses; the newest win. */
const SITEMAP_LIMIT = 45_000

export async function sitemapXml(rawHost: string): Promise<string> {
  const host = rawHost.trim().toLowerCase()
  const site = await siteForHost(host)
  if (site) {
    const home = storefrontUrl(site)
    // Only the canonical address of a live website is listed.
    if (site.published === false || home !== `https://${host}`) return urlset([])
    const posts = await BlogPost.find({ storefrontId: String(site._id), status: 'published', published: true }).select('slug updatedAt').sort({ updatedAt: -1 }).limit(SITEMAP_LIMIT).lean()
    return urlset([
      { loc: `${home}/`, changefreq: 'weekly', priority: '1.0' },
      ...['properties', 'about', 'news', 'contact'].map((page) => ({ loc: `${home}/${page}`, changefreq: page === 'properties' || page === 'news' ? 'daily' : 'monthly', priority: '0.7' })),
      ...posts.map((p) => ({ loc: `${home}/news/${p.slug}`, lastmod: updatedAt(p), priority: '0.6' })),
    ])
  }
  if (!isPlatformHost(host) || host.endsWith('.vercel.app')) return urlset([])

  const base = publicBaseUrl()
  const [listings, articles] = await Promise.all([
    Property.find({ listingStatus: { $in: PUBLICLY_VISIBLE_STATUSES }, listingRef: { $type: 'string' }, landlordId: { $nin: await closedAccountIds() } })
      .select('listingRef updatedAt').sort({ updatedAt: -1 }).limit(SITEMAP_LIMIT).lean(),
    // RentOS's own articles; a website's posts are listed in that website's sitemap.
    BlogPost.find({ published: true, storefrontId: { $eq: null } }).select('slug updatedAt').sort({ updatedAt: -1 }).limit(5_000).lean(),
  ])
  return urlset([
    ...PLATFORM_PAGES.map((p) => ({ loc: `${base}${p.path}`, changefreq: p.changefreq, priority: p.priority })),
    ...listings.map((l) => ({ loc: `${base}/property/${String(l.listingRef).toLowerCase()}`, lastmod: updatedAt(l), priority: '0.8' })),
    ...articles.map((a) => ({ loc: `${base}/article/${a.slug}`, lastmod: updatedAt(a), priority: '0.6' })),
  ])
}

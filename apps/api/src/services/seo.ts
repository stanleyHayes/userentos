/**
 * Search and link-preview metadata for public pages, served to the web app's
 * page renderer (apps/web/api/page.ts) so a listing, an article, a search page
 * or an agency website shows its own title, description, photo, structured
 * data and readable content before any JavaScript runs: WhatsApp, Facebook and
 * X never run it, and search engines rank the first HTML they get far sooner
 * than a rendered page.
 *
 * Also builds each host's sitemap: the platform's own pages, its search
 * landing pages, listings (with their photos) and RentOS articles, and for a
 * website its pages and news.
 */
import { BlogPost } from '../models/BlogPost.js'
import { Property } from '../models/Property.js'
import { Storefront } from '../models/Storefront.js'
import { PUBLICLY_VISIBLE_STATUSES } from './propertyReview.js'
import { closedAccountIds, isClosedAccount } from './closedAccounts.js'
import { listingPathFor, normalizeListingRef, slugify } from './listings.js'
import { resolveStorefrontByHost, storefrontUrl } from './storefront.js'
import { publicBaseUrl } from '../utils/env.js'
import { landingPage, landingSitemapEntries, popularSearches, publicFacets, purposeBySlug, TYPE_FACETS, type LandingModel } from './seoLanding.js'
import {
  cardsHtml, chipsHtml, esc, faqHtml, heroHtml, main, markdownHtml, money, platformPage, safeHref, section, sitePage,
  type CardListing, type Crumb,
} from './seoHtml.js'

export interface PageMeta {
  title: string
  description: string
  canonical: string
  image: string
  type: 'website' | 'article'
  siteName: string
  noindex: boolean
  /** 404 for a listing, article, search page or website that does not exist (or is not public). */
  status: 200 | 404
  /** Page-specific structured data. */
  jsonLd: Record<string, unknown>[]
  /** On an agency website the RentOS organisation data does not describe the page. */
  replaceSiteJsonLd: boolean
  /** The page's readable content, served inside #root until the app takes over (services/seoHtml.ts). */
  body?: string
}

const PLATFORM_NAME = 'RentOS Ghana'
const MAX_DESCRIPTION = 160

const TYPE_LABELS: Record<string, string> = {
  apartment: 'Apartment', house: 'House', studio: 'Studio apartment', townhouse: 'Townhouse', room: 'Room',
  shared_room: 'Shared room', hostel: 'Hostel room', commercial: 'Commercial space', warehouse: 'Warehouse',
}
const SCHEMA_TYPES: Record<string, string> = { apartment: 'Apartment', studio: 'Apartment', house: 'SingleFamilyResidence', townhouse: 'House', room: 'Room', shared_room: 'Room', hostel: 'Accommodation', commercial: 'Accommodation', warehouse: 'Accommodation' }
const PRICE_SUFFIX: Record<string, string> = { rent: '/month', short_let: '/night', sale: '' }
const PURPOSE: Record<string, string> = { rent: 'for rent', sale: 'for sale', short_let: 'for short stays' }
const PURPOSE_SLUG: Record<string, string> = { rent: 'rent', sale: 'buy', short_let: 'short-stay' }

/** The platform's static, indexable pages (also its sitemap). Signed-in pages such as /properties are not among them. */
export const PLATFORM_PAGES: { path: string; priority: string; changefreq: string; title?: string; description?: string; noindex?: boolean }[] = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/registry', priority: '0.9', changefreq: 'daily', title: 'Property registry: verified houses and apartments in Ghana | RentOS', description: 'Search reviewed homes for rent, for sale and for short stays across Ghana by city, price and property type, each with its own shareable page.' },
  { path: '/blog', priority: '0.8', changefreq: 'daily', title: 'RentOS Real Estate News: property news and guides for Ghana', description: 'Rental guides from RentOS and market news from agents and agencies across Ghana: prices, tenancy law, deposits and buying tips.' },
  { path: '/rental-laws', priority: '0.8', changefreq: 'monthly', title: 'Ghana rental laws explained: tenant and landlord rights | RentOS', description: 'Plain-language guide to the Rent Act 1963 (Act 220), rent advance limits, deposits, evictions and the Rent Control Department.' },
  // Out of search until the developer journey opens: today it is a short list nothing links to.
  { path: '/developments', priority: '0.6', changefreq: 'weekly', title: 'New developments and off-plan homes in Ghana | RentOS', description: 'New-build and off-plan homes from property developers in Ghana, reviewed by RentOS before they are published.', noindex: true },
  { path: '/support', priority: '0.4', changefreq: 'monthly' },
  { path: '/register', priority: '0.5', changefreq: 'yearly', title: 'Create your free RentOS account', description: 'Join RentOS free as a tenant or as an agent, agency or property manager: find homes, list properties and get your own property website.' },
  { path: '/privacy', priority: '0.3', changefreq: 'yearly' },
  { path: '/terms', priority: '0.3', changefreq: 'yearly' },
  { path: '/data-protection', priority: '0.3', changefreq: 'yearly' },
]

const SITE_PAGES: Record<string, string> = { '': '', properties: 'Properties', about: 'About', news: 'News', contact: 'Contact' }

const clip = (text: string, max = MAX_DESCRIPTION) => {
  const flat = text.replace(/[#*_>`[\]]/g, '').replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).replace(/\s+\S*$/, '')}…`
}

const price = (amount: number, listingType: string) => `${money(amount)}${PRICE_SUFFIX[listingType] ?? '/month'}`
/** Popular searches decorate a page; a failed lookup must never cost a page its metadata. */
const popular = (limit: number) => popularSearches(limit).catch(() => [])
/** On the platform a website's pages live under /s/<slug>, so its own root-relative links (its nav too) move with them. */
const underPrefix = (html: string, prefix: string) => prefix ? html.replace(/href="\/(?!\/)([^"]*)"/g, (_m, rest: string) => `href="${prefix}${rest ? `/${rest}` : ''}"`) : html
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function platformDefaults(): PageMeta {
  const base = publicBaseUrl()
  return {
    title: 'Houses and apartments for rent and sale in Ghana | RentOS',
    description: 'Find verified houses, apartments, rooms and short stays to rent or buy in Accra, Kumasi, Tema and across Ghana. Message agents safely and sign your tenancy online.',
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

const notFound = (meta: PageMeta, what: string): PageMeta => ({ ...meta, title: `${what} not found | RentOS`, noindex: true, status: 404, jsonLd: [], body: undefined })

function breadcrumbLd(crumbs: Crumb[], base = publicBaseUrl()) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.path.startsWith('http') ? c.path : `${base}${c.path}` })),
  }
}

const LISTING_FIELDS = 'title description images listingRef listingType type address rentAmount bedrooms bathrooms floorArea furnished amenities rules availableFrom parkingSpaces status publishedAt updatedAt landlordId'

async function publicListing(key: string) {
  const ref = normalizeListingRef(key)
  const match = /^[a-f0-9]{24}$/i.test(key) ? { _id: key } : ref ? { listingRef: ref } : null
  if (!match) return null
  const doc = await Property.findOne({ ...match, listingStatus: { $in: PUBLICLY_VISIBLE_STATUSES } }).select(LISTING_FIELDS).lean()
  if (!doc || await isClosedAccount(doc.landlordId)) return null
  return doc
}

type ListingDoc = NonNullable<Awaited<ReturnType<typeof publicListing>>>

/** The search pages a listing belongs to: its purpose, city, neighbourhood and type. */
function listingCrumbs(doc: ListingDoc): { crumbs: Crumb[]; areaPath: string | null; typePath: string | null; typeNoun: string } {
  const purposeSlug = PURPOSE_SLUG[doc.listingType ?? 'rent'] ?? 'rent'
  const purpose = purposeBySlug(purposeSlug)!
  const city = (doc.address?.city ?? '').trim(); const citySlug = slugify(city)
  const area = (doc.address?.neighborhood ?? '').trim(); const areaSlug = slugify(area)
  const facet = TYPE_FACETS.find((t) => t.types.includes(doc.type ?? ''))
  const crumbs: Crumb[] = [{ name: 'Home', path: '/' }, { name: purpose.crumb, path: `/${purposeSlug}` }]
  if (citySlug) crumbs.push({ name: city, path: `/${purposeSlug}/${citySlug}` })
  if (citySlug && areaSlug) crumbs.push({ name: area, path: `/${purposeSlug}/${citySlug}/${areaSlug}` })
  const areaPath = citySlug ? `/${purposeSlug}/${citySlug}${areaSlug ? `/${areaSlug}` : ''}` : null
  return { crumbs, areaPath, typePath: areaPath && facet ? `${areaPath}/${facet.slug}` : null, typeNoun: facet?.noun ?? 'homes' }
}

function listingBody(doc: ListingDoc, canonical: string): { content: string; crumbs: Crumb[] } {
  const listingType = doc.listingType ?? 'rent'
  const place = [doc.address?.neighborhood, doc.address?.city].filter(Boolean).join(', ') || 'Ghana'
  const typeLabel = TYPE_LABELS[doc.type ?? ''] ?? 'Property'
  const { crumbs, areaPath, typePath, typeNoun } = listingCrumbs(doc)
  const facts = [
    price(doc.rentAmount ?? 0, listingType),
    doc.bedrooms && !['commercial', 'warehouse'].includes(doc.type ?? '') ? plural(doc.bedrooms, 'bedroom', 'bedrooms') : '',
    doc.bathrooms ? plural(doc.bathrooms, 'bathroom', 'bathrooms') : '',
    typeLabel, PURPOSE[listingType] ?? 'for rent', place,
    doc.floorArea ? `${doc.floorArea} m²` : '', doc.furnished ? 'Furnished' : '',
    doc.availableFrom ? `Available from ${String(doc.availableFrom).slice(0, 10)}` : '',
  ].filter(Boolean)
  const images = (doc.images ?? []).map(String).map(safeHref).filter((u): u is string => Boolean(u)).slice(0, 6)
  const description = (doc.description ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const content = heroHtml({ crumbs: [...crumbs, { name: doc.title, path: canonical }], title: doc.title, paragraphs: [`${typeLabel} ${PURPOSE[listingType] ?? 'for rent'} in ${place}.`], facts })
    + main([
      images.length ? `<div class="ssr-gallery">${images.map((src, i) => `<img src="${esc(src)}" alt="${esc(`${doc.title}, ${place}, photo ${i + 1}`)}" loading="${i ? 'lazy' : 'eager'}" width="640" height="480">`).join('')}</div>` : '',
      section('About this property', `<article>${description.map((p) => `<p>${esc(p)}</p>`).join('')}</article>`),
      section('Amenities', doc.amenities?.length ? `<ul>${doc.amenities.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''),
      section('House rules', doc.rules?.length ? `<ul>${doc.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''),
      `<p class="ssr-muted">Listing reviewed by RentOS before it was published. Message the agent on RentOS: your phone number stays private.</p>`,
      section('More homes nearby', chipsHtml([
        ...(typePath ? [{ label: `More ${typeNoun} ${PURPOSE[listingType] ?? 'for rent'} in ${place}`, path: typePath }] : []),
        ...(areaPath ? [{ label: `All homes ${PURPOSE[listingType] ?? 'for rent'} in ${place}`, path: areaPath }] : []),
        { label: 'Search the property registry', path: '/registry' },
      ])),
    ].join(''))
  return { content, crumbs }
}

/**
 * A listing's search title, description, canonical address and structured
 * data. The app applies the same values after it renders (GET
 * /public/properties/:ref returns them as `seo`), so the page Google renders
 * says what the first HTML said.
 */
export function listingSeo(doc: ListingDoc): { title: string; description: string; canonical: string; jsonLd: Record<string, unknown>[] } {
  const listingType = doc.listingType ?? 'rent'
  const typeLabel = TYPE_LABELS[doc.type ?? ''] ?? 'Property'
  const purpose = PURPOSE[listingType] ?? 'for rent'
  const place = [doc.address?.neighborhood, doc.address?.city].filter(Boolean).join(', ') || 'Ghana'
  // One indexable address per listing, on the platform, whichever host showed it.
  const canonical = `${publicBaseUrl()}${listingPathFor(doc)}`
  const images = (doc.images ?? []).map(String)
  const rooms = doc.bedrooms && !['commercial', 'warehouse'].includes(doc.type ?? '') ? `${doc.bedrooms}-bedroom ` : ''
  const headline = `${rooms}${rooms ? typeLabel.toLowerCase() : typeLabel} ${purpose} in ${place}`
  const priced = `${headline} · ${price(doc.rentAmount ?? 0, listingType)}`
  const { crumbs } = listingCrumbs(doc)
  return {
    title: priced.length <= 62 ? `${priced} | RentOS` : `${headline} | RentOS`,
    description: clip(`${headline}: ${price(doc.rentAmount ?? 0, listingType)}${doc.bathrooms ? `, ${plural(doc.bathrooms, 'bathroom', 'bathrooms')}` : ''}${doc.furnished ? ', furnished' : ''}. ${doc.title}. ${doc.description ?? ''}`),
    canonical,
    jsonLd: [{
      '@context': 'https://schema.org',
      '@type': 'RealEstateListing',
      name: doc.title,
      description: clip(doc.description ?? doc.title, 500),
      url: canonical,
      ...(images.length ? { image: images.slice(0, 6) } : {}),
      ...(doc.publishedAt ? { datePosted: new Date(doc.publishedAt).toISOString() } : {}),
      offers: {
        '@type': 'Offer',
        price: doc.rentAmount ?? 0,
        priceCurrency: 'GHS',
        availability: doc.status === 'available' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        businessFunction: listingType === 'sale' ? 'http://purl.org/goodrelations/v1#Sell' : 'http://purl.org/goodrelations/v1#LeaseOut',
        ...(listingType !== 'sale' ? { priceSpecification: { '@type': 'UnitPriceSpecification', price: doc.rentAmount ?? 0, priceCurrency: 'GHS', unitCode: listingType === 'short_let' ? 'DAY' : 'MON' } } : {}),
      },
      about: {
        '@type': SCHEMA_TYPES[doc.type ?? ''] ?? 'Accommodation',
        name: headline,
        ...(doc.bedrooms ? { numberOfBedrooms: doc.bedrooms, numberOfRooms: doc.bedrooms } : {}),
        ...(doc.bathrooms ? { numberOfBathroomsTotal: doc.bathrooms } : {}),
        ...(doc.floorArea ? { floorSize: { '@type': 'QuantitativeValue', value: doc.floorArea, unitCode: 'MTK' } } : {}),
        ...(doc.amenities?.length ? { amenityFeature: doc.amenities.slice(0, 20).map((a) => ({ '@type': 'LocationFeatureSpecification', name: a, value: true })) } : {}),
        address: { '@type': 'PostalAddress', addressLocality: doc.address?.city || doc.address?.neighborhood || undefined, addressRegion: doc.address?.region || undefined, addressCountry: 'GH' },
      },
    }, breadcrumbLd([...crumbs, { name: doc.title, path: canonical }])],
  }
}

/** `sitePrefix` is /s/<slug> when a website's listing is shown on the platform. */
async function listingMeta(key: string, base: PageMeta, site?: SiteRecord, sitePrefix = ''): Promise<PageMeta> {
  const doc = await publicListing(key)
  if (!doc) return notFound(base, 'Property')
  const seo = listingSeo(doc)
  const { content } = listingBody(doc, seo.canonical)
  return {
    ...base,
    title: site ? `${doc.title} · ${site.name}` : seo.title,
    description: seo.description,
    canonical: seo.canonical,
    image: doc.images?.[0] ? String(doc.images[0]) : base.image,
    jsonLd: seo.jsonLd,
    // On an agent's website, links to RentOS's search pages go to the platform: the website's own host has no such pages.
    body: site
      ? underPrefix(sitePage({ name: site.name, home: storefrontUrl(site) }, content.replace(/href="\/(?!\/)/g, `href="${publicBaseUrl()}/`)), sitePrefix)
      : platformPage(content, await popular(10)),
  }
}

type SiteRecord = { _id: unknown; ownerId?: string; slug: string; name: string; tagline?: string; about?: string; heroSubtitle?: string; canonicalDomain?: string | null; branding?: { logoUrl?: string; coverUrl?: string }; contact?: { city?: string; hours?: string }; serviceAreas?: string[]; services?: string[]; published?: boolean }

async function visibleSites(): Promise<string[]> {
  const hidden = await Storefront.find({ $or: [{ status: { $ne: 'active' } }, { published: false }] }).select('_id').lean()
  return hidden.map((s) => String(s._id))
}

const dateLabel = (d?: Date | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

function articleBody(post: { title: string; excerpt?: string; content?: string; coverImage?: string; author?: string; publishedAt?: Date; createdAt?: Date }, crumbs: Crumb[], byline: string): string {
  const cover = safeHref(post.coverImage)
  return heroHtml({ crumbs, title: post.title, paragraphs: [post.excerpt ?? '', [byline, dateLabel(post.publishedAt ?? post.createdAt)].filter(Boolean).join(' · ')].filter(Boolean) })
    + main(`${cover ? `<p><img src="${esc(cover)}" alt="${esc(post.title)}" width="1200" height="630" style="max-width:100%;height:auto;border-radius:16px"></p>` : ''}<article>${markdownHtml(post.content ?? '')}</article>`)
}

/** A RentOS article, or a website post if it is live. */
async function articleMeta(slug: string, base: PageMeta): Promise<PageMeta> {
  const post = await BlogPost.findOne({ slug, published: true }).select('title excerpt content coverImage slug author storefrontId platform status createdAt updatedAt publishedAt').lean()
  if (!post) return notFound(base, 'Article')
  let site: SiteRecord | null = null
  if (post.storefrontId) {
    if (post.status !== 'published' || (await visibleSites()).includes(post.storefrontId)) return notFound(base, 'Article')
    site = await Storefront.findById(post.storefrontId).select('slug name canonicalDomain branding').lean() as SiteRecord | null
    if (!site) return notFound(base, 'Article')
  }
  // A website's post is indexed on the website; this copy credits it.
  const canonical = site ? `${storefrontUrl(site)}/news/${post.slug}` : `${publicBaseUrl()}/article/${post.slug}`
  const crumbs: Crumb[] = [{ name: 'Home', path: '/' }, { name: 'Real Estate News', path: '/blog' }, { name: post.title, path: `/article/${post.slug}` }]
  const related = await BlogPost.find({ published: true, storefrontId: { $eq: null }, slug: { $ne: post.slug } }).select('title slug').sort({ publishedAt: -1, createdAt: -1 }).limit(5).lean()
  const body = articleBody(post, crumbs, site ? `By ${site.name}` : `By ${post.author || 'RentOS'}`)
    + main(section('More from RentOS Real Estate News', chipsHtml(related.map((r) => ({ label: r.title, path: `/article/${r.slug}` })))))
  return {
    ...base,
    title: `${post.title} | RentOS Real Estate News`,
    description: clip(post.excerpt || post.title),
    canonical,
    image: post.coverImage || base.image,
    type: 'article',
    jsonLd: [articleLd(post, canonical, site ? { name: site.name, url: storefrontUrl(site) } : { name: 'RentOS', url: publicBaseUrl() }), breadcrumbLd(crumbs)],
    body: platformPage(body, await popular(10)),
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

const cardFromDoc = (d: ListingDoc & { _id: unknown; listingRef?: string }, pathPrefix = ''): CardListing => ({
  path: `${pathPrefix}${listingPathFor(d)}`,
  title: d.title,
  place: [d.address?.neighborhood, d.address?.city].filter(Boolean).join(', ') || 'Ghana',
  price: price(d.rentAmount ?? 0, d.listingType ?? 'rent'),
  facts: [d.bedrooms && !['commercial', 'warehouse'].includes(d.type ?? '') ? plural(d.bedrooms, 'bedroom', 'bedrooms') : '', TYPE_LABELS[d.type ?? ''] ?? 'Property'].filter(Boolean).join(' · '),
  image: d.images?.[0] ? String(d.images[0]) : null,
})

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
  // Links inside a website stay on it: on its own host from "/", on the platform under /s/<slug>.
  const prefix = onHost ? '' : `/s/${site.slug}`
  const frame = (content: string) => underPrefix(sitePage({ name: site.name, home }, content), prefix)

  if (page === 'property' && detail) return listingMeta(detail, base, site, prefix)
  if (page === 'news' && detail) {
    const post = await BlogPost.findOne({ slug: detail, storefrontId: String(site._id), status: 'published', published: true }).select('title excerpt content coverImage slug createdAt updatedAt publishedAt').lean()
    if (!post) return notFound(base, 'Post')
    const canonical = `${home}/news/${post.slug}`
    const crumbs: Crumb[] = [{ name: site.name, path: '/' }, { name: 'News', path: '/news' }, { name: post.title, path: `/news/${post.slug}` }]
    return { ...base, title: `${post.title} · ${site.name}`, description: clip(post.excerpt || post.title), canonical, image: post.coverImage || base.image, type: 'article', jsonLd: [articleLd(post, canonical, { name: site.name, url: home })], body: frame(articleBody(post, crumbs, `By ${site.name}`)) }
  }
  if (!Object.hasOwn(SITE_PAGES, page) || detail) return { ...base, title: site.name, canonical: home, noindex: true, status: 404 }

  const label = SITE_PAGES[page]
  const listings = site.ownerId && (page === '' || page === 'properties')
    ? await Property.find({ landlordId: site.ownerId, listingStatus: { $in: PUBLICLY_VISIBLE_STATUSES } }).select(LISTING_FIELDS).sort({ publishedAt: -1, createdAt: -1 }).limit(page === '' ? 6 : 24).lean()
    : []
  const posts = page === '' || page === 'news'
    ? await BlogPost.find({ storefrontId: String(site._id), status: 'published', published: true }).select('title slug excerpt').sort({ publishedAt: -1, createdAt: -1 }).limit(page === '' ? 3 : 20).lean()
    : []
  const cards = cardsHtml(listings.map((d) => ({ ...cardFromDoc(d as ListingDoc & { _id: unknown }), path: `/property/${listingPathFor(d).replace(/^\/(property|registry)\//, '')}` })))
  const postLinks = chipsHtml(posts.map((p) => ({ label: p.title, path: `/news/${p.slug}` })))
  const intro = [site.heroSubtitle || site.tagline || '', page === 'about' || page === '' ? clip(site.about ?? '', page === 'about' ? 4000 : 400) : ''].filter(Boolean)
  const content = heroHtml({ title: label ? `${label} · ${site.name}` : site.name, paragraphs: intro, facts: [site.contact?.city ?? '', ...(site.serviceAreas ?? []).slice(0, 6)].filter(Boolean) })
    + main([
      page === '' || page === 'properties' ? section(page === '' ? 'Latest listings' : 'Properties', cards || '<p class="ssr-muted">No listings right now.</p>') : '',
      page === '' && site.services?.length ? section('Services', `<ul>${site.services.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`) : '',
      page === '' || page === 'news' ? section('News', postLinks) : '',
      page === 'contact' ? `<p>Send ${esc(site.name)} a message on RentOS: your enquiry and their reply stay in your RentOS messages.${site.contact?.hours ? ` Office hours: ${esc(site.contact.hours)}.` : ''}</p>` : '',
    ].join(''))
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
    body: frame(content),
  }
}

/** /rent, /buy and /short-stay search pages (services/seoLanding.ts). */
async function landingMeta(model: LandingModel, base: PageMeta): Promise<PageMeta> {
  if (model.status === 404) return { ...notFound(base, 'Page'), canonical: model.canonical }
  const baseUrl = publicBaseUrl()
  const statsTable = model.stats.byBedrooms.length
    ? `<table class="ssr-table"><thead><tr><th>Bedrooms</th><th>Listings</th><th>Median price</th></tr></thead><tbody>${model.stats.byBedrooms.map((b) => `<tr><td>${b.bedrooms === 5 ? '5+' : b.bedrooms}</td><td>${b.count}</td><td>${esc(`${money(b.median)}${model.stats.priceSuffix}`)}</td></tr>`).join('')}</tbody></table>`
    : ''
  const facts = model.count ? [plural(model.count, 'listing', 'listings'), `Median ${money(model.stats.median)}${model.stats.priceSuffix}`] : []
  const content = heroHtml({ crumbs: model.breadcrumbs, title: model.h1, paragraphs: model.intro, facts })
    + main([
      model.listings.length ? cardsHtml(model.listings) : `<p class="ssr-muted">No listings here yet. <a href="/registry">Search all verified listings</a>.</p>`,
      section('Browse by area', chipsHtml(model.areas)),
      section('Browse by property type', chipsHtml(model.types)),
      section(`Prices in ${model.place}`, statsTable),
      section('Also on RentOS', chipsHtml(model.related)),
      section('Frequently asked questions', faqHtml(model.faq)),
    ].join(''))
  return {
    ...base,
    title: model.title,
    description: model.description,
    canonical: model.canonical,
    noindex: base.noindex || model.noindex,
    image: model.listings.find((l) => l.image)?.image ?? base.image,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: model.h1,
        description: model.description,
        url: model.canonical,
        isPartOf: { '@id': `${baseUrl}/#website` },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: model.count,
          itemListElement: model.listings.map((l, i) => ({ '@type': 'ListItem', position: i + 1, url: `${baseUrl}${l.path}`, name: l.title })),
        },
      },
      breadcrumbLd(model.breadcrumbs, baseUrl),
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: model.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      },
    ],
    body: platformPage(content, await popular(12)),
  }
}

/** Readable content for the platform's own pages: home, the registry and the news index. */
async function platformBody(path: string): Promise<string | undefined> {
  if (path !== '/' && path !== '/registry' && path !== '/blog') return undefined
  const searches = await popular(12)
  if (path === '/') {
    const posts = await BlogPost.find({ published: true, storefrontId: { $eq: null } }).select('title slug excerpt').sort({ publishedAt: -1, createdAt: -1 }).limit(3).lean()
    const content = heroHtml({
      title: 'Houses and apartments to rent and buy in Ghana',
      paragraphs: ['Renting, finally in sync.', 'Find verified houses and apartments to rent or buy in Accra, Kumasi and across Ghana. Message agents safely, sign your tenancy agreement online and keep every rent record in one place.'],
    }) + main([
      chipsHtml([{ label: 'Start your rental journey', path: '/register' }, { label: 'Explore listings', path: '/registry' }]),
      section('Popular searches', chipsHtml(searches)),
      section('Find a home', chipsHtml([{ label: 'Homes for rent in Ghana', path: '/rent' }, { label: 'Homes for sale in Ghana', path: '/buy' }, { label: 'Short stays in Ghana', path: '/short-stay' }, { label: 'Know your rights as a tenant', path: '/rental-laws' }])),
      section('Rental insights and product updates', chipsHtml(posts.map((p) => ({ label: p.title, path: `/article/${p.slug}` })))),
    ].join(''))
    return platformPage(content, searches)
  }
  if (path === '/registry') {
    const facets = (await publicFacets().catch(() => [])).slice(0, 24)
    const cards = facets.map((f) => ({ path: f.path, title: f.title, place: [f.area, f.city].filter(Boolean).join(', ') || 'Ghana', price: price(f.price, f.listingType), facts: [f.bedrooms && !['commercial', 'warehouse'].includes(f.type) ? plural(f.bedrooms, 'bedroom', 'bedrooms') : '', TYPE_LABELS[f.type] ?? 'Property'].filter(Boolean).join(' · '), image: f.image }))
    const content = heroHtml({ title: 'Homes for rent, for sale and short lets in Ghana', paragraphs: ['Listings from agents across Ghana, each reviewed by RentOS before it is published, with the price shown up front.'] })
      + main(cardsHtml(cards) + section('Popular searches', chipsHtml(searches)))
    return platformPage(content, searches)
  }
  if (path === '/blog') {
    const posts = await BlogPost.find({ published: true, storefrontId: { $eq: null } }).select('title slug excerpt author publishedAt createdAt').sort({ publishedAt: -1, createdAt: -1 }).limit(20).lean()
    const list = posts.map((p) => `<li><h3><a href="/article/${esc(p.slug)}">${esc(p.title)}</a></h3>${p.excerpt ? `<p>${esc(p.excerpt)}</p>` : ''}<p class="ssr-muted">${esc([p.author || 'RentOS', dateLabel(p.publishedAt ?? (p as { createdAt?: Date }).createdAt)].filter(Boolean).join(' · '))}</p></li>`).join('')
    const content = heroHtml({ title: 'RentOS Real Estate News', paragraphs: ['Guides from RentOS and market news from agents across Ghana.'] }) + main(`<ul style="list-style:none;padding:0;max-width:820px">${list}</ul>`)
    return platformPage(content, searches)
  }
  return undefined
}

const SITE_FIELDS = 'slug name tagline about heroSubtitle canonicalDomain branding contact serviceAreas services published status ownerId'

const platformHostname = () => new URL(publicBaseUrl()).hostname

/**
 * RentOS's own hosts. Always the platform, whatever PUBLIC_BASE_URL says: if
 * it were mis-set (it once named the API host), www.userentos.com would read
 * as an agent website called "www" and the home page would go out as a
 * noindexed 404.
 */
const OWN_HOSTS = new Set(['userentos.com', 'www.userentos.com'])

/** Is this the platform itself (userentos.com, www, a preview or local host)? */
function isPlatformHost(host: string): boolean {
  const name = host.split(':')[0]
  return OWN_HOSTS.has(name) || name === platformHostname() || name === `www.${platformHostname()}` || name === 'localhost' || name.endsWith('.vercel.app')
}

async function siteForHost(host: string): Promise<SiteRecord | null> {
  if (isPlatformHost(host)) return null
  const resolved = await resolveStorefrontByHost(host)
  return resolved ? await Storefront.findOne({ slug: resolved.slug, status: 'active' }).select(SITE_FIELDS).lean() as SiteRecord | null : null
}

/** Metadata for one page; null when the page sets its own in the browser and the defaults will do. */
export async function pageMeta(rawHost: string, rawPath: string): Promise<PageMeta | null> {
  const host = rawHost.trim().toLowerCase()
  const decode = (segment: string) => { try { return decodeURIComponent(segment) } catch { return segment } }
  const path = `/${rawPath.split(/[?#]/)[0].split('/').filter(Boolean).map(decode).join('/')}`
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
  if (first && purposeBySlug(first)) {
    const model = await landingPage(first, parts.slice(1))
    if (model) return landingMeta(model, base)
  }
  const page = PLATFORM_PAGES.find((p) => p.path === path)
  if (page) {
    return {
      ...base,
      noindex: base.noindex || page.noindex === true,
      canonical: `${publicBaseUrl()}${page.path === '/' ? '/' : page.path}`,
      ...(page.title ? { title: page.title } : {}),
      ...(page.description ? { description: page.description } : {}),
      // Readable content is a bonus: a failed lookup must not cost the page its title and canonical.
      body: await platformBody(page.path).catch(() => undefined),
    }
  }
  return null
}

/** The data behind a search landing page, for the app to render (GET /api/seo/landing). */
export async function landingData(purpose: string, path: string): Promise<LandingModel | null> {
  const segments = path.split('/').filter(Boolean).map((segment) => { try { return decodeURIComponent(segment) } catch { return segment } })
  return landingPage(purpose, segments)
}

/** Schemas get updatedAt from timestamps: true, which their interfaces do not declare. */
const updatedAt = (doc: object) => (doc as { updatedAt?: Date }).updatedAt

const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function urlset(urls: { loc: string; lastmod?: Date | null; changefreq?: string; priority?: string; images?: string[] }[]): string {
  const body = urls.map((u) => [
    '  <url>',
    `    <loc>${escapeXml(u.loc)}</loc>`,
    u.lastmod ? `    <lastmod>${u.lastmod.toISOString().slice(0, 10)}</lastmod>` : '',
    u.changefreq ? `    <changefreq>${u.changefreq}</changefreq>` : '',
    u.priority ? `    <priority>${u.priority}</priority>` : '',
    ...(u.images ?? []).map((src) => `    <image:image><image:loc>${escapeXml(src)}</image:loc></image:image>`),
    '  </url>',
  ].filter(Boolean).join('\n')).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${body}\n</urlset>\n`
}

/** Sitemaps hold at most 50,000 addresses; the newest win. */
const SITEMAP_MAX = 50_000
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
  const [listings, articles, landings] = await Promise.all([
    Property.find({ listingStatus: { $in: PUBLICLY_VISIBLE_STATUSES }, listingRef: { $type: 'string' }, landlordId: { $nin: await closedAccountIds() } })
      .select('listingRef listingType type bedrooms address updatedAt').slice('images', 5).sort({ updatedAt: -1 }).limit(SITEMAP_LIMIT).lean(),
    // RentOS's own articles; a website's posts are listed in that website's sitemap.
    BlogPost.find({ published: true, storefrontId: { $eq: null } }).select('slug updatedAt').sort({ updatedAt: -1 }).limit(5_000).lean(),
    landingSitemapEntries(),
  ])
  // Spent in order (search pages, articles, then listings), so the file never passes 50,000 addresses.
  const cap = SITEMAP_MAX - PLATFORM_PAGES.filter((p) => !p.noindex).length
  const keptLandings = landings.slice(0, cap)
  const keptArticles = articles.slice(0, Math.max(0, cap - keptLandings.length))
  const room = Math.max(0, cap - keptLandings.length - keptArticles.length)
  return urlset([
    ...PLATFORM_PAGES.filter((p) => !p.noindex).map((p) => ({ loc: `${base}${p.path}`, changefreq: p.changefreq, priority: p.priority })),
    ...keptLandings.map((l) => ({ loc: `${base}${l.path}`, lastmod: l.lastmod, changefreq: 'daily', priority: l.path.split('/').length <= 3 ? '0.9' : '0.8' })),
    ...listings.slice(0, room).map((l) => ({
      loc: `${base}${listingPathFor(l)}`,
      lastmod: updatedAt(l),
      priority: '0.8',
      images: (l.images ?? []).map(String).filter((src) => /^https?:\/\//.test(src)).slice(0, 5),
    })),
    ...keptArticles.map((a) => ({ loc: `${base}/article/${a.slug}`, lastmod: updatedAt(a), priority: '0.6' })),
  ])
}

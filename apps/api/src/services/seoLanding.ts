/**
 * Search landing pages: /rent, /buy and /short-stay, by city, neighbourhood and
 * property type — "Apartments for rent in East Legon, Accra".
 *
 * These are the pages people land on from searches like "houses for rent in
 * Spintex". Each is built from the live listings only: counts, price ranges
 * and medians are computed, never written by hand, and a page with no listings
 * is marked noindex and left out of the sitemap so search engines never see a
 * thin page. Neighbourhoods appear as soon as a listing names them.
 */
import { Property } from '../models/Property.js'
import { PUBLICLY_VISIBLE_STATUSES } from './propertyReview.js'
import { closedAccountIds } from './closedAccounts.js'
import { listingPathFor, slugify } from './listings.js'
import { publicBaseUrl } from '../utils/env.js'
import { logger } from '../utils/logger.js'
import { money, type CardListing, type Crumb, type LinkItem } from './seoHtml.js'

export interface Purpose { slug: string; listingType: 'rent' | 'sale' | 'short_let'; crumb: string; phrase: string; priceSuffix: string; priceWord: string }

export const PURPOSES: Purpose[] = [
  { slug: 'rent', listingType: 'rent', crumb: 'For rent', phrase: 'for rent', priceSuffix: '/month', priceWord: 'a month' },
  { slug: 'buy', listingType: 'sale', crumb: 'For sale', phrase: 'for sale', priceSuffix: '', priceWord: '' },
  { slug: 'short-stay', listingType: 'short_let', crumb: 'Short stays', phrase: 'short stay', priceSuffix: '/night', priceWord: 'a night' },
]
export const purposeBySlug = (slug: string) => PURPOSES.find((p) => p.slug === slug)

export interface TypeFacet { slug: string; types: string[]; plural: string; noun: string; aka?: string }

/** Overlapping on purpose: "houses" includes townhouses, "apartments" includes studios, as people search. */
export const TYPE_FACETS: TypeFacet[] = [
  { slug: 'apartments', types: ['apartment', 'studio'], plural: 'Apartments', noun: 'apartments' },
  { slug: 'houses', types: ['house', 'townhouse'], plural: 'Houses', noun: 'houses' },
  { slug: 'rooms', types: ['room', 'shared_room'], plural: 'Rooms', noun: 'rooms', aka: 'single rooms, chamber and hall and self-contained rooms' },
  { slug: 'studios', types: ['studio'], plural: 'Studio apartments', noun: 'studio apartments' },
  { slug: 'townhouses', types: ['townhouse'], plural: 'Townhouses', noun: 'townhouses' },
  { slug: 'hostels', types: ['hostel'], plural: 'Hostel rooms', noun: 'hostel rooms' },
  { slug: 'commercial', types: ['commercial'], plural: 'Commercial spaces', noun: 'commercial spaces', aka: 'offices and shops' },
  { slug: 'warehouses', types: ['warehouse'], plural: 'Warehouses', noun: 'warehouses' },
]
const typeBySlug = (slug: string) => TYPE_FACETS.find((t) => t.slug === slug)

/** Ghana's main markets: their pages exist (noindexed while empty) so links to them never 404. */
const MAJOR_CITIES = ['Accra', 'Kumasi', 'Tema', 'Takoradi', 'Cape Coast', 'Tamale', 'Kasoa', 'Koforidua', 'Ho', 'Sunyani']

interface Facet {
  id: string
  ref: string | null
  path: string
  title: string
  listingType: string
  type: string
  city: string
  citySlug: string
  region: string
  area: string
  areaSlug: string
  price: number
  bedrooms: number
  bathrooms: number
  image: string | null
  furnished: boolean
  postedAt: number
  updatedAt: Date | null
}

const CACHE_MS = 5 * 60 * 1000
/** How often a page that would answer 404 may look again for a place it does not know (a listing there may just have been approved). */
const MISS_REFRESH_MS = 30 * 1000
/** After a failed refresh, the last good copy is served this long before trying again. */
const RETRY_MS = 30 * 1000
let cache: { at: number; facets: Facet[] } | null = null
let inflight: { promise: Promise<Facet[]>; generation: number } | null = null
/** After a failed reload, no new attempt before this time, whatever maxAge a caller asks for. */
let retryAt = 0
/** Bumped by clearLandingCache, so a refresh that started before a change does not count as fresh. */
let generation = 0

async function loadFacets(): Promise<Facet[]> {
  const docs = await Property.find({ listingStatus: { $in: PUBLICLY_VISIBLE_STATUSES }, landlordId: { $nin: await closedAccountIds() } })
    .select('title listingRef listingType type address.city address.region address.neighborhood rentAmount bedrooms bathrooms furnished publishedAt createdAt updatedAt')
    .slice('images', 1)
    .sort({ publishedAt: -1, createdAt: -1, _id: -1 }).limit(20_000).lean()
  const facets = docs.map((d): Facet => ({
    id: String(d._id),
    ref: d.listingRef ?? null,
    path: listingPathFor(d),
    title: d.title ?? 'Property',
    listingType: d.listingType ?? 'rent',
    type: d.type ?? '',
    city: (d.address?.city ?? '').trim(),
    citySlug: slugify(d.address?.city),
    region: (d.address?.region ?? '').trim(),
    area: (d.address?.neighborhood ?? '').trim(),
    areaSlug: slugify(d.address?.neighborhood),
    price: typeof d.rentAmount === 'number' ? d.rentAmount : 0,
    bedrooms: typeof d.bedrooms === 'number' ? d.bedrooms : 0,
    bathrooms: typeof d.bathrooms === 'number' ? d.bathrooms : 0,
    image: d.images?.[0] ? String(d.images[0]) : null,
    furnished: Boolean(d.furnished),
    postedAt: new Date(d.publishedAt ?? (d as { createdAt?: Date }).createdAt ?? 0).getTime(),
    updatedAt: (d as { updatedAt?: Date }).updatedAt ?? null,
  }))
  return facets
}

/**
 * Every public listing's searchable facts, cached for five minutes (or
 * `maxAge`). Concurrent callers share one refresh, and a failed refresh keeps
 * serving the last good copy, so a slow or failing query never multiplies
 * under load or empties every page at once.
 */
export async function publicFacets(opts: { maxAge?: number } = {}): Promise<Facet[]> {
  const maxAge = opts.maxAge ?? CACHE_MS
  const now = Date.now()
  if (cache && (now - cache.at < maxAge || now < retryAt)) return cache.facets
  // Join a load in progress only if it started after the last change; an older one may miss it.
  if (inflight && inflight.generation === generation) return inflight.promise
  const started = generation
  const promise: Promise<Facet[]> = loadFacets().then(
    (facets) => {
      retryAt = 0
      // A load that started before a change is kept only as a stale fallback, never over a fresher copy.
      if (started === generation) cache = { at: Date.now(), facets }
      else if (!cache) cache = { at: 0, facets }
      return facets
    },
    (err: unknown) => {
      if (!cache) throw err
      logger.warn(`[seo] listing facets refresh failed, serving the previous copy: ${(err as Error).message}`)
      retryAt = Date.now() + RETRY_MS
      return cache.facets
    },
  ).finally(() => { if (inflight?.promise === promise) inflight = null })
  inflight = { promise, generation: started }
  return promise
}

/** After a listing joins or leaves the public pages: the next request reloads (the old copy stays as a fallback). */
export function clearLandingCache() {
  generation += 1
  retryAt = 0
  if (cache) cache = { ...cache, at: 0 }
}


const titleCase = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase().replace(/(^|[\s-])\S/g, (c) => c.toUpperCase())

/** The most common spelling of a name across listings ("east legon" and "East Legon" read as one). */
function displayName(values: string[]): string {
  const counts = new Map<string, number>()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  return best === best.toLowerCase() || best === best.toUpperCase() ? titleCase(best) : best
}

const median = (values: number[]) => {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b)
  if (!sorted.length) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

const matchesPurpose = (f: Facet, purpose: Purpose) => purpose.listingType === 'rent' ? f.listingType !== 'sale' && f.listingType !== 'short_let' : f.listingType === purpose.listingType

export interface LandingModel {
  purpose: string
  path: string
  canonical: string
  h1: string
  title: string
  description: string
  intro: string[]
  count: number
  stats: { min: number; max: number; median: number; priceSuffix: string; byBedrooms: { bedrooms: number; count: number; median: number }[] }
  listings: LandingListing[]
  areas: LinkItem[]
  types: LinkItem[]
  related: LinkItem[]
  breadcrumbs: Crumb[]
  faq: { q: string; a: string }[]
  noindex: boolean
  status: 200 | 404
  lastmod: Date | null
  place: string
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** A listing card: what the HTML renderer prints, plus the fields the app's registry card reads. */
export type LandingListing = CardListing & { id: string; ref: string | null; listingType: string; city: string; region: string; neighborhood: string; digitalAddress: string; propertyType: string; rentAmount: number; bedrooms: number; bathrooms: number; listingStatus: 'approved'; publishedAt: string | null }

function cardFor(f: Facet, purpose: Purpose): LandingListing {
  const typeLabel = f.type ? titleCase(f.type.replace('_', ' ')) : 'Property'
  const facts = [f.bedrooms > 0 && !['commercial', 'warehouse'].includes(f.type) ? plural(f.bedrooms, 'bedroom', 'bedrooms') : '', typeLabel, f.furnished ? 'Furnished' : ''].filter(Boolean).join(' · ')
  return {
    id: f.id, ref: f.ref, path: f.path, title: f.title, place: [f.area, f.city].filter(Boolean).join(', ') || 'Ghana', price: `${money(f.price)}${purpose.priceSuffix}`, facts, image: f.image,
    listingType: f.listingType, city: f.city, region: f.region, neighborhood: f.area, digitalAddress: '', propertyType: f.type, rentAmount: f.price, bedrooms: f.bedrooms, bathrooms: f.bathrooms,
    listingStatus: 'approved', publishedAt: f.postedAt ? new Date(f.postedAt).toISOString() : null,
  }
}

/**
 * The page for /<purpose>/<city>/<area>/<type>, any part after the purpose
 * optional. Null when the purpose is not one of ours; status 404 for a place
 * or type that does not exist.
 */
export async function landingPage(purposeSlug: string, segments: string[]): Promise<LandingModel | null> {
  const purpose = purposeBySlug(purposeSlug)
  if (!purpose) return null
  const parts = segments.map((s) => slugify(s)).filter(Boolean)
  let everything = await publicFacets()
  // A place no cached listing names may have just been approved: look again (at most every 30 seconds) before answering 404.
  const named = (slug: string) => Boolean(typeBySlug(slug)) || MAJOR_CITIES.some((c) => slugify(c) === slug) || everything.some((f) => f.citySlug === slug || f.areaSlug === slug)
  if (!parts.every(named)) everything = await publicFacets({ maxAge: MISS_REFRESH_MS })
  const all = everything.filter((f) => matchesPurpose(f, purpose))

  // Resolve [city] [area] [type]; a type may stand alone at any level.
  let citySlug = ''; let areaSlug = ''; let type: TypeFacet | undefined
  // A place exists if any listing (for any purpose) names it, so /rent/x is an empty page, not a 404, while x has only sales.
  const knownCity = (slug: string) => everything.some((f) => f.citySlug === slug) || MAJOR_CITIES.some((c) => slugify(c) === slug)
  const rest = [...parts]
  if (rest.length && typeBySlug(rest[0]) && !knownCity(rest[0])) type = typeBySlug(rest.shift()!)
  else if (rest.length) {
    citySlug = rest.shift()!
    if (rest.length && typeBySlug(rest[0])) type = typeBySlug(rest.shift()!)
    else if (rest.length) {
      areaSlug = rest.shift()!
      if (rest.length && typeBySlug(rest[0])) type = typeBySlug(rest.shift()!)
    }
  }
  const base = publicBaseUrl()
  const cityFacets = citySlug ? all.filter((f) => f.citySlug === citySlug) : all
  const areaFacets = areaSlug ? cityFacets.filter((f) => f.areaSlug === areaSlug) : cityFacets
  const facets = type ? areaFacets.filter((f) => type!.types.includes(f.type)) : areaFacets
  const anyInCity = citySlug ? everything.filter((f) => f.citySlug === citySlug) : everything
  const anyInArea = areaSlug ? anyInCity.filter((f) => f.areaSlug === areaSlug) : anyInCity
  const unknown = rest.length > 0 || (citySlug && !knownCity(citySlug)) || (areaSlug && !anyInArea.length)

  const cityName = citySlug ? (displayName(anyInCity.map((f) => f.city)) || MAJOR_CITIES.find((c) => slugify(c) === citySlug) || titleCase(citySlug.replace(/-/g, ' '))) : ''
  const areaName = areaSlug ? displayName(anyInArea.map((f) => f.area)) || titleCase(areaSlug.replace(/-/g, ' ')) : ''
  const place = areaName ? `${areaName}, ${cityName}` : cityName || 'Ghana'
  const what = type ? type.plural : 'Houses and apartments'
  const h1 = purpose.slug === 'short-stay'
    ? `${type ? `Short-stay ${type.noun}` : 'Short-stay apartments and rooms'} in ${place}`
    : `${what} ${purpose.phrase} in ${place}`
  const path = `/${[purpose.slug, citySlug, areaSlug, type?.slug].filter(Boolean).join('/')}`
  const canonical = `${base}${path}`

  const prices = facets.map((f) => f.price)
  const stats = {
    min: prices.length ? Math.min(...prices.filter((p) => p > 0), Infinity) : 0,
    max: prices.length ? Math.max(...prices) : 0,
    median: median(prices),
    priceSuffix: purpose.priceSuffix,
    byBedrooms: [1, 2, 3, 4, 5].map((n) => {
      const group = facets.filter((f) => (n === 5 ? f.bedrooms >= 5 : f.bedrooms === n) && !['commercial', 'warehouse'].includes(f.type))
      return { bedrooms: n, count: group.length, median: median(group.map((f) => f.price)) }
    }).filter((b) => b.count > 0),
  }
  if (!Number.isFinite(stats.min)) stats.min = 0
  const count = facets.length
  const nouns = type ? type.noun : 'homes'
  const priceRange = count > 1 && stats.min !== stats.max
    ? `, from ${money(stats.min)} to ${money(stats.max)}${purpose.priceWord ? ` ${purpose.priceWord}` : ''}`
    : count === 1 ? ` at ${money(stats.max)}${purpose.priceWord ? ` ${purpose.priceWord}` : ''}` : ''

  const intro = [
    count
      ? `There ${count === 1 ? 'is' : 'are'} ${plural(count, type ? type.noun.replace(/s$/, '') : 'home', nouns)} ${purpose.slug === 'short-stay' ? 'for short stays' : purpose.phrase} in ${place} on RentOS right now${priceRange}.`
      : `There are no ${nouns} ${purpose.slug === 'short-stay' ? 'for short stays' : purpose.phrase} in ${place} on RentOS right now. New listings appear here as soon as RentOS has reviewed them.`,
    `Every listing is checked by RentOS before it goes live. Message the agent on RentOS: your phone number stays private and the agent is alerted straight away.${type?.aka ? ` This page includes ${type.aka}.` : ''}`,
  ]

  const childLinks = (items: Facet[], key: 'citySlug' | 'areaSlug', name: 'city' | 'area', prefix: string) => {
    const groups = new Map<string, Facet[]>()
    for (const f of items) if (f[key]) groups.set(f[key], [...(groups.get(f[key]) ?? []), f])
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 24)
      .map(([slug, group]) => ({ label: displayName(group.map((f) => f[name])), path: `${prefix}/${slug}`, count: group.length }))
  }
  const placePrefix = `/${[purpose.slug, citySlug, areaSlug].filter(Boolean).join('/')}`
  const areas = !citySlug
    ? childLinks(all, 'citySlug', 'city', `/${purpose.slug}`)
    : !areaSlug ? childLinks(cityFacets, 'areaSlug', 'area', `/${purpose.slug}/${citySlug}`)
      : childLinks(cityFacets.filter((f) => f.areaSlug !== areaSlug), 'areaSlug', 'area', `/${purpose.slug}/${citySlug}`).slice(0, 12)
  const types = TYPE_FACETS.map((t) => ({ label: `${t.plural} ${purpose.slug === 'short-stay' ? 'for short stays' : purpose.phrase}`, path: `${placePrefix}/${t.slug}`, count: areaFacets.filter((f) => t.types.includes(f.type)).length }))
    .filter((t) => t.count > 0 && t.path !== path)
  const related = PURPOSES.filter((p) => p.slug !== purpose.slug).map((p) => {
    const n = everything.filter((f) => matchesPurpose(f, p) && (!citySlug || f.citySlug === citySlug) && (!areaSlug || f.areaSlug === areaSlug)).length
    return { label: `${p.crumb} in ${place}`, path: `/${[p.slug, citySlug, areaSlug].filter(Boolean).join('/')}`, count: n }
  }).filter((r) => r.count > 0)

  const breadcrumbs: Crumb[] = [{ name: 'Home', path: '/' }, { name: purpose.crumb, path: `/${purpose.slug}` }]
  if (citySlug) breadcrumbs.push({ name: cityName, path: `/${purpose.slug}/${citySlug}` })
  if (areaSlug) breadcrumbs.push({ name: areaName, path: `/${purpose.slug}/${citySlug}/${areaSlug}` })
  if (type) breadcrumbs.push({ name: type.plural, path })

  const faq: { q: string; a: string }[] = []
  if (count) {
    faq.push({
      q: purpose.slug === 'buy' ? `How much do ${nouns} cost in ${place}?` : purpose.slug === 'short-stay' ? `How much is a short stay in ${place}?` : `How much is rent for ${nouns} in ${place}?`,
      a: count > 1
        ? `Asking prices on RentOS range from ${money(stats.min)} to ${money(stats.max)}${purpose.priceWord ? ` ${purpose.priceWord}` : ''}, with a median of ${money(stats.median)} across ${count} listings.${stats.byBedrooms.length > 1 ? ` ${stats.byBedrooms.map((b) => `${b.bedrooms === 5 ? '5+' : b.bedrooms}-bedroom: ${money(b.median)}`).join('; ')} (median).` : ''}`
        : `The one listing on RentOS right now asks ${money(stats.max)}${purpose.priceWord ? ` ${purpose.priceWord}` : ''}.`,
    })
  }
  faq.push({ q: `How many ${nouns} are listed in ${place}?`, a: count ? `${plural(count, 'listing', 'listings')} right now, updated as new listings are approved.` : 'None right now. Check back soon: listings appear as soon as RentOS has reviewed them.' })
  if (purpose.slug === 'rent') faq.push({ q: 'How much rent advance can a landlord ask for in Ghana?', a: "Under the Rent Act, 1963 (Act 220), for a tenancy of more than six months a landlord may not demand more than six months' rent in advance. For a monthly (or shorter) tenancy, the limit is one month's rent." })
  faq.push({ q: 'How do I contact the agent safely?', a: 'Use "Message on RentOS" on the listing. Your phone number stays private, the agent replies in your RentOS messages, and keeping viewings and payments on RentOS keeps them on record.' })

  const lastmod = facets.reduce<Date | null>((latest, f) => (f.updatedAt && (!latest || f.updatedAt > latest) ? f.updatedAt : latest), null)
  const description = count
    ? `${count} verified ${type ? type.noun : 'houses and apartments'} ${purpose.slug === 'short-stay' ? 'for short stays' : purpose.phrase} in ${place}${priceRange}. Message agents safely on RentOS.`
    : `${type ? type.plural : 'Houses and apartments'} ${purpose.slug === 'short-stay' ? 'for short stays' : purpose.phrase} in ${place}, verified by RentOS. Message agents safely and keep every viewing and payment on record.`

  return {
    purpose: purpose.slug,
    path,
    canonical,
    h1,
    title: `${h1} | RentOS`,
    description: description.length > 160 ? `${description.slice(0, 157).replace(/\s+\S*$/, '')}…` : description,
    intro,
    count,
    stats,
    listings: facets.slice(0, 24).map((f) => cardFor(f, purpose)),
    areas,
    types,
    related,
    breadcrumbs,
    faq,
    // A page with nothing on it stays out of search until it has listings.
    noindex: count === 0,
    status: unknown ? 404 : 200,
    lastmod,
    place,
  }
}

/** Indexable landing pages for the sitemap: every purpose, city, neighbourhood and type that has listings. */
export async function landingSitemapEntries(): Promise<{ path: string; lastmod: Date | null }[]> {
  const facets = await publicFacets()
  const entries = new Map<string, Date | null>()
  const add = (path: string, f: Facet) => {
    const prev = entries.get(path)
    entries.set(path, !prev || (f.updatedAt && f.updatedAt > prev) ? f.updatedAt : prev)
  }
  for (const f of facets) {
    for (const purpose of PURPOSES) {
      if (!matchesPurpose(f, purpose)) continue
      const levels = [`/${purpose.slug}`, f.citySlug ? `/${purpose.slug}/${f.citySlug}` : '', f.citySlug && f.areaSlug ? `/${purpose.slug}/${f.citySlug}/${f.areaSlug}` : ''].filter(Boolean)
      for (const level of levels) {
        add(level, f)
        for (const t of TYPE_FACETS) if (t.types.includes(f.type)) add(`${level}/${t.slug}`, f)
      }
    }
  }
  return [...entries.entries()].map(([path, lastmod]) => ({ path, lastmod }))
}

/** The busiest searches, for "Popular searches" on the home page and in the footer. */
export async function popularSearches(limit = 12): Promise<LinkItem[]> {
  const facets = await publicFacets()
  const counts = new Map<string, LinkItem>()
  for (const f of facets) {
    for (const purpose of PURPOSES) {
      if (!matchesPurpose(f, purpose) || !f.citySlug) continue
      const cityPath = `/${purpose.slug}/${f.citySlug}`
      const label = purpose.slug === 'short-stay' ? `Short stays in ${titleCase(f.city)}` : `Homes ${purpose.phrase} in ${titleCase(f.city)}`
      const entry = counts.get(cityPath) ?? { label, path: cityPath, count: 0 }
      entry.count = (entry.count ?? 0) + 1
      counts.set(cityPath, entry)
      if (f.areaSlug) {
        const areaPath = `${cityPath}/${f.areaSlug}`
        const areaEntry = counts.get(areaPath) ?? { label: `${purpose.crumb} in ${titleCase(f.area)}`, path: areaPath, count: 0 }
        areaEntry.count = (areaEntry.count ?? 0) + 1
        counts.set(areaPath, areaEntry)
      }
    }
  }
  const ranked = [...counts.values()].sort((a, b) => (b.count ?? 0) - (a.count ?? 0)).slice(0, limit)
  // Always offer the main markets, so a new site still links its core pages.
  const fallback: LinkItem[] = [
    { label: 'Houses for rent in Accra', path: '/rent/accra/houses' },
    { label: 'Apartments for rent in Accra', path: '/rent/accra/apartments' },
    { label: 'Homes for rent in Kumasi', path: '/rent/kumasi' },
    { label: 'Homes for rent in Tema', path: '/rent/tema' },
    { label: 'Houses for sale in Accra', path: '/buy/accra/houses' },
    { label: 'Short stays in Accra', path: '/short-stay/accra' },
  ]
  for (const item of fallback) if (ranked.length < limit && !ranked.some((r) => r.path === item.path)) ranked.push(item)
  return ranked.map(({ label, path }) => ({ label, path }))
}

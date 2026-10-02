// What a listing is for (product brief §04). One property record carries its
// purpose; search, filters, cards, detail pages, agent websites and the central
// registry all read it from here, so adding a type later is one entry below
// (plus the API's enum in apps/api/src/services/listings.ts).
//
// The asking price lives in the listing's rentAmount field whatever the type —
// one price field keeps search, sorting and price filters working across
// types — and `priceSuffix` says what that number is for.

export const LISTING_TYPES = [
  { value: 'rent', label: 'For Rent', shortLabel: 'Rent', priceLabel: 'Monthly rent', priceSuffix: '/month', compactSuffix: '/mo' },
  { value: 'sale', label: 'For Sale', shortLabel: 'Sale', priceLabel: 'Sale price', priceSuffix: '', compactSuffix: '' },
  { value: 'short_let', label: 'Short Let', shortLabel: 'Short let', priceLabel: 'Price per night', priceSuffix: '/night', compactSuffix: '/night' },
] as const

export type ListingType = (typeof LISTING_TYPES)[number]['value']
export type ListingTypeMeta = (typeof LISTING_TYPES)[number]

/** Listings created before types existed have none: they are rentals. */
export function listingTypeMeta(value: string | null | undefined): ListingTypeMeta {
  return LISTING_TYPES.find((type) => type.value === value) ?? LISTING_TYPES[0]
}

export function isListingType(value: unknown): value is ListingType {
  return LISTING_TYPES.some((type) => type.value === value)
}

/** Only monthly rentals go through the rental application and agreement flow. */
export function acceptsRentalApplications(value: string | null | undefined): boolean {
  return listingTypeMeta(value).value === 'rent'
}

/** "GHS 2,500/month", "GHS 450/night", "GHS 850,000". */
export function formatListingPrice(amount: number, listingType: string | null | undefined, opts: { compact?: boolean; currency?: string } = {}): string {
  const meta = listingTypeMeta(listingType)
  const currency = opts.currency ?? 'GHS'
  const value = Number.isFinite(amount) ? amount : 0
  const number = value.toLocaleString('en-GH', { maximumFractionDigits: 0 })
  return `${currency} ${number}${opts.compact ? meta.compactSuffix : meta.priceSuffix}`
}

/** The public, shareable address of a listing, e.g. https://userentos.com/property/rx7k2p9. */
export function listingPath(ref: string): string {
  return `/property/${ref.toLowerCase()}`
}

/** URL-safe words: "East Legon" → "east-legon", accents dropped. */
export function slugify(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const TYPE_WORDS: Record<string, string> = {
  apartment: 'apartment', house: 'house', studio: 'studio', townhouse: 'townhouse', room: 'room',
  shared_room: 'shared-room', hostel: 'hostel-room', commercial: 'commercial-space', warehouse: 'warehouse',
}
const PURPOSE_WORDS: Record<string, string> = { rent: 'for-rent', sale: 'for-sale', short_let: 'short-stay' }

/**
 * The descriptive part of a listing's address, from its facts:
 * "2-bedroom-townhouse-for-rent-in-east-legon-accra". Mirrored by listingSlug in
 * apps/api/src/services/listings.ts; keep the two identical.
 */
export function listingSlug(listing: { bedrooms?: number | null; type?: string | null; propertyType?: string | null; listingType?: string | null; neighborhood?: string | null; city?: string | null; address?: { neighborhood?: string | null; city?: string | null } | null }): string {
  const kind = listing.type ?? listing.propertyType ?? ''
  const bedrooms = listing.bedrooms && listing.bedrooms > 0 && !['commercial', 'warehouse'].includes(kind) ? `${listing.bedrooms}-bedroom-` : ''
  const type = TYPE_WORDS[kind] ?? 'property'
  const purpose = PURPOSE_WORDS[listing.listingType ?? ''] ?? 'for-rent'
  const place = [listing.address?.neighborhood ?? listing.neighborhood, listing.address?.city ?? listing.city].map(slugify).filter(Boolean)
  const unique = place.filter((part, i) => place.indexOf(part) === i)
  const slug = `${bedrooms}${type}-${purpose}${unique.length ? `-in-${unique.join('-')}` : ''}`
  // Long names stop at a whole word.
  return slug.length <= 90 ? slug : slug.slice(0, 91).replace(/-[^-]*$/, '')
}

/** The address a listing is indexed at: /property/<description>-<ref>; old /property/<ref> links still open it. */
export function listingSeoPath(listing: Parameters<typeof listingSlug>[0] & { ref?: string | null; listingRef?: string | null; id?: string | null }): string {
  const ref = listing.ref ?? listing.listingRef
  return ref ? `/property/${listingSlug(listing)}-${ref.toLowerCase()}` : `/registry/${listing.id ?? ''}`
}


/** Where each purpose's search pages live: /rent, /buy and /short-stay. */
export const PURPOSE_SEARCH: Record<string, { slug: string; crumb: string; phrase: string }> = {
  rent: { slug: 'rent', crumb: 'For rent', phrase: 'for rent' },
  sale: { slug: 'buy', crumb: 'For sale', phrase: 'for sale' },
  short_let: { slug: 'short-stay', crumb: 'Short stays', phrase: 'for short stays' },
}

/** Home › For rent › Accra › East Legon: the search pages a listing appears on. */
export function listingBreadcrumbs(listing: { listingType?: string | null; city?: string | null; neighborhood?: string | null }): { name: string; to: string }[] {
  const purpose = PURPOSE_SEARCH[listingTypeMeta(listing.listingType).value] ?? PURPOSE_SEARCH.rent
  const city = (listing.city ?? '').trim()
  const area = (listing.neighborhood ?? '').trim()
  const crumbs = [{ name: 'Home', to: '/' }, { name: purpose.crumb, to: `/${purpose.slug}` }]
  if (slugify(city)) crumbs.push({ name: city, to: `/${purpose.slug}/${slugify(city)}` })
  if (slugify(city) && slugify(area)) crumbs.push({ name: area, to: `/${purpose.slug}/${slugify(city)}/${slugify(area)}` })
  return crumbs
}

/** The listing reference inside any listing address: "…-in-osu-accra-rx7k2p9" or "rx7k2p9" → "rx7k2p9". */
export function listingKey(param: string): string {
  const last = param.slice(param.lastIndexOf('-') + 1)
  return /^[23456789abcdefghjkmnpqrstuvwxyz]{7}$/i.test(last) ? last.toLowerCase() : param.toLowerCase()
}

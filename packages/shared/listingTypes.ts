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

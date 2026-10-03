import crypto from 'node:crypto'
import { publicBaseUrl } from '../utils/env.js'

/**
 * Listing purpose (product brief §04). Mirrors packages/shared/listingTypes.ts.
 *
 * The asking price is the listing's rentAmount whatever the type — monthly
 * rent, a nightly short-let rate or a sale price — so search, sorting and price
 * filters work across types. Rent statistics, fair-rent comparisons and the
 * rental application flow must therefore look at rentals only.
 */
export const LISTING_TYPES = ['rent', 'sale', 'short_let'] as const
export type ListingType = (typeof LISTING_TYPES)[number]

/** Monthly rentals, including listings created before types existed (no field). */
export const RENTAL_LISTINGS = { listingType: { $nin: ['sale', 'short_let'] } } as const

export function isRentalListing(listingType: string | null | undefined): boolean {
  return listingType !== 'sale' && listingType !== 'short_let'
}

/**
 * A short, unique reference for sharing a listing: 7 characters from an
 * alphabet without look-alikes (no 0/O, 1/I/L), e.g. RX7K2P9. 31^7 ≈ 2.8e10
 * values, and a unique index backs it.
 */
const REF_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const LISTING_REF = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{7}$/

export function generateListingRef(): string {
  const bytes = crypto.randomBytes(7)
  let ref = ''
  for (const byte of bytes) ref += REF_ALPHABET[byte % REF_ALPHABET.length]
  return ref
}

/**
 * Accounts that list property and run a property website: landlords & owners,
 * agents / agencies / property managers, and staff. Any other account (a
 * tenant, a worker, a business) used to be able to create and publish
 * listings and launch a public website by calling the API directly.
 * Mirrors packages/shared/productScope.ts (the API image does not ship it).
 */
export const PROPERTY_PROFESSIONAL_ROLES = ['landlord', 'property_manager', 'admin', 'super_admin'] as const

/**
 * Normalizes a reference typed or shared in any case; null if it can't be one.
 * Accepts a listing's descriptive address too ("2-bedroom-house-for-rent-in-osu-accra-rx7k2p9"):
 * the reference is its last part.
 */
export function normalizeListingRef(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim()
  const ref = raw.slice(raw.lastIndexOf('-') + 1).toUpperCase()
  return LISTING_REF.test(ref) ? ref : null
}

/** The public page every listing can be shared at (short; it redirects nowhere, the page names its full address). */
export function listingUrl(ref: string): string {
  return `${publicBaseUrl()}/property/${ref.toLowerCase()}`
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
 * The descriptive part of a listing's address, built from its facts rather than its
 * free-text title: "2-bedroom-townhouse-for-rent-in-east-legon-accra". Mirrors
 * listingSlug in packages/shared/listingTypes.ts (the API image does not ship it).
 */
export function listingSlug(listing: { bedrooms?: number | null; type?: string | null; listingType?: string | null; address?: { neighborhood?: string | null; city?: string | null } | null }): string {
  const bedrooms = listing.bedrooms && listing.bedrooms > 0 && !['commercial', 'warehouse'].includes(listing.type ?? '') ? `${listing.bedrooms}-bedroom-` : ''
  const type = TYPE_WORDS[listing.type ?? ''] ?? 'property'
  const purpose = PURPOSE_WORDS[listing.listingType ?? ''] ?? 'for-rent'
  const place = [listing.address?.neighborhood, listing.address?.city].map(slugify).filter(Boolean)
  // "Accra, Accra" (a neighbourhood named after its city) reads once.
  const unique = place.filter((part, i) => place.indexOf(part) === i)
  const slug = `${bedrooms}${type}-${purpose}${unique.length ? `-in-${unique.join('-')}` : ''}`
  // Long names stop at a whole word.
  return slug.length <= 90 ? slug : slug.slice(0, 91).replace(/-[^-]*$/, '')
}

/** The address search engines index a listing at: /property/<description>-<ref>. */
export function listingPathFor(listing: Parameters<typeof listingSlug>[0] & { listingRef?: string | null; _id?: unknown }): string {
  const key = listing.listingRef ? listing.listingRef.toLowerCase() : String(listing._id)
  return listing.listingRef ? `/property/${listingSlug(listing)}-${key}` : `/registry/${key}`
}

/**
 * A phone number in international form, digits only — what wa.me and the SMS
 * providers want. Ghana numbers are written locally (024 412 3456) or as +233;
 * anything else of plausible length is taken as already international.
 */
export function internationalNumber(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (/^0\d{9}$/.test(digits)) return `233${digits.slice(1)}`
  if (/^233\d{9}$/.test(digits)) return digits
  if (/^[2-9]\d{8}$/.test(digits)) return `233${digits}`
  if (/^\d{8,15}$/.test(digits) && !digits.startsWith('0')) return digits
  return null
}

/** The pre-filled enquiry (brief §05): the agent knows at once which property it is about. */
export function whatsappEnquiryText(listing: { title: string; location: string; ref: string | null; url: string }): string {
  return [
    'Hello, I am interested in this property:',
    listing.title,
    listing.location,
    listing.ref ? `Ref ${listing.ref}: ${listing.url}` : listing.url,
  ].filter(Boolean).join('\n')
}

export function whatsappLink(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}

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

/** Normalizes a reference typed or shared in any case; null if it can't be one. */
export function normalizeListingRef(value: string | null | undefined): string | null {
  const ref = (value ?? '').trim().toUpperCase()
  return LISTING_REF.test(ref) ? ref : null
}

/** The public page every listing can be shared at. */
export function listingUrl(ref: string): string {
  return `${publicBaseUrl()}/property/${ref.toLowerCase()}`
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

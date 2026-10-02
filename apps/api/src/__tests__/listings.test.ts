import { describe, expect, it, vi } from 'vitest'
import { generateListingRef, internationalNumber, isRentalListing, listingUrl, normalizeListingRef, whatsappEnquiryText, whatsappLink, LISTING_REF } from '../services/listings.js'
import { enquiryNotice, enquirySms } from '../services/enquiryNotices.js'

describe('listing references', () => {
  it('generates short references without look-alike characters', () => {
    for (let i = 0; i < 500; i++) {
      const ref = generateListingRef()
      expect(ref).toMatch(LISTING_REF)
      expect(ref).not.toMatch(/[01ILO]/)
    }
  })

  it('accepts a shared reference in any case and rejects anything else', () => {
    expect(normalizeListingRef(' rx7k2p9 ')).toBe('RX7K2P9')
    expect(normalizeListingRef('RX7K2P')).toBeNull()
    expect(normalizeListingRef('RX7K2P0')).toBeNull()
    expect(normalizeListingRef(undefined)).toBeNull()
  })

  it('builds the public URL on the web origin, lower-cased', () => {
    vi.stubEnv('PUBLIC_BASE_URL', 'https://userentos.com/')
    expect(listingUrl('RX7K2P9')).toBe('https://userentos.com/property/rx7k2p9')
    vi.unstubAllEnvs()
  })
})

describe('listing purpose', () => {
  it('treats listings without a type as rentals', () => {
    expect(isRentalListing(undefined)).toBe(true)
    expect(isRentalListing('rent')).toBe(true)
    expect(isRentalListing('sale')).toBe(false)
    expect(isRentalListing('short_let')).toBe(false)
  })
})

describe('WhatsApp enquiries', () => {
  it('turns local and international Ghana numbers into what wa.me wants', () => {
    expect(internationalNumber('024 412 3456')).toBe('233244123456')
    expect(internationalNumber('+233 24 412 3456')).toBe('233244123456')
    expect(internationalNumber('244123456')).toBe('233244123456')
    expect(internationalNumber('+44 7700 900123')).toBe('447700900123')
    expect(internationalNumber('12')).toBeNull()
    expect(internationalNumber(undefined)).toBeNull()
  })

  it('pre-fills the property name, location and reference link (brief §05)', () => {
    const text = whatsappEnquiryText({ title: '2-Bed Apartment', location: 'East Legon, Accra', ref: 'RX7K2P9', url: 'https://userentos.com/property/rx7k2p9' })
    expect(text).toBe('Hello, I am interested in this property:\n2-Bed Apartment\nEast Legon, Accra\nRef RX7K2P9: https://userentos.com/property/rx7k2p9')
    expect(whatsappLink('233244123456', text)).toBe(`https://wa.me/233244123456?text=${encodeURIComponent(text)}`)
  })
})

describe('agent alerts for a new enquiry', () => {
  it('names the property but never the enquirer', () => {
    expect(enquiryNotice('interest', 'Sunny Flat')).toContain('"Sunny Flat"')
    expect(enquiryNotice('whatsapp', 'Sunny Flat')).toContain('WhatsApp')
    expect(enquiryNotice('website', 'Sunny Flat')).toContain('website')
  })

  it('texts the brief\'s wording with a link to the lead, keeping long titles short', () => {
    const sms = enquirySms('interest', 'Sunny Flat', 'https://userentos.com/agent/leads?lead=abc')
    expect(sms).toBe('RentOS: A new tenant has expressed interest in your property "Sunny Flat". View the enquiry: https://userentos.com/agent/leads?lead=abc')
    const long = enquirySms('whatsapp', 'A'.repeat(80), 'https://x.test/l')
    expect(long).toContain(`"${'A'.repeat(41)}…"`)
  })
})

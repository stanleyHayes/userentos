import { afterEach, describe, expect, it, vi } from 'vitest'
import { listingPathFor, listingSlug, normalizeListingRef, slugify } from '../services/listings.js'
import { esc, markdownHtml, safeHref } from '../services/seoHtml.js'
import { listingIndexPaths, submitToIndexNow } from '../services/indexNow.js'

describe('descriptive listing addresses', () => {
  it('reads the reference at the end of any listing address', () => {
    expect(normalizeListingRef('rx7k2p9')).toBe('RX7K2P9')
    expect(normalizeListingRef('2-bedroom-house-for-rent-in-osu-accra-rx7k2p9')).toBe('RX7K2P9')
    expect(normalizeListingRef('RX7K2P9 ')).toBe('RX7K2P9')
    expect(normalizeListingRef('house-for-rent')).toBeNull()
    expect(normalizeListingRef('')).toBeNull()
    // 0, O, 1, I and L are not in the alphabet.
    expect(normalizeListingRef('x-rx0k2p9')).toBeNull()
  })

  it('describes a listing by its facts, not its free-text title', () => {
    expect(slugify('East Legon')).toBe('east-legon')
    expect(slugify('Cantonments & Labone')).toBe('cantonments-and-labone')
    expect(slugify('Kpémé ')).toBe('kpeme')
    const listing = { bedrooms: 2, type: 'townhouse', listingType: 'rent', address: { neighborhood: 'East Legon', city: 'Accra' } }
    expect(listingSlug(listing)).toBe('2-bedroom-townhouse-for-rent-in-east-legon-accra')
    expect(listingSlug({ ...listing, listingType: 'sale' })).toBe('2-bedroom-townhouse-for-sale-in-east-legon-accra')
    expect(listingSlug({ ...listing, listingType: 'short_let', type: 'studio', bedrooms: 1 })).toBe('1-bedroom-studio-short-stay-in-east-legon-accra')
    // Commercial spaces have no bedrooms; a neighbourhood named after its city reads once.
    expect(listingSlug({ bedrooms: 1, type: 'commercial', listingType: 'rent', address: { neighborhood: 'Accra', city: 'Accra' } })).toBe('commercial-space-for-rent-in-accra')
    expect(listingSlug({ type: 'room', address: {} })).toBe('room-for-rent')
    expect(listingPathFor({ ...listing, listingRef: 'RX7K2P9' })).toBe('/property/2-bedroom-townhouse-for-rent-in-east-legon-accra-rx7k2p9')
    expect(listingPathFor({ ...listing, _id: '64b000000000000000000001' })).toBe('/registry/64b000000000000000000001')
  })
})

describe('server-rendered content', () => {
  it('escapes text and only links to safe addresses', () => {
    expect(esc('<b>"x" & \'y\'</b>')).toBe('&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;')
    expect(safeHref('/rent/accra')).toBe('/rent/accra')
    expect(safeHref('https://example.com/a')).toBe('https://example.com/a')
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('//evil.example/x')).toBeNull()
    expect(safeHref('https://x.com/" onerror="alert(1)')).toBeNull()
  })

  it('renders article Markdown without letting HTML or script through', () => {
    const html = markdownHtml('# Rent in Accra\n\nA **bold** move with [a guide](https://example.com/guide) and [a trap](javascript:alert(1)).\n\n- one\n- two\n\n<script>alert(1)</script>\n\n![photo](https://img.example/a.jpg) ![bad](javascript:x)')
    expect(html).toContain('<h2>Rent in Accra</h2>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<a href="https://example.com/guide">a guide</a>')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('a trap')
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('<img src="https://img.example/a.jpg" alt="photo" loading="lazy">')
  })

  it("keeps an apostrophe in a link address as part of the address", () => {
    expect(markdownHtml("[PNC](https://en.wikipedia.org/wiki/People's_National_Convention)")).toContain('<a href="https://en.wikipedia.org/wiki/People%27s_National_Convention">PNC</a>')
  })

  it('renders a post full of brackets in linear time', () => {
    // Anyone with a free account can publish a 60,000-character post, rendered on every page view.
    // The last one is a heading: spaces and a line separator that '.' would not match without the s flag.
    for (const body of ['["'.repeat(30_000), '[note '.repeat(10_000), '!['.repeat(30_000), '[a](b'.repeat(12_000), `#${' '.repeat(59_000)}\u2028 x`]) {
      const started = performance.now()
      markdownHtml(body)
      // Quadratic matching took seconds here; linear takes a few milliseconds.
      expect(performance.now() - started).toBeLessThan(1_000)
    }
  })
})

describe('IndexNow', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it('lists a listing and every search page it appears on', () => {
    expect(listingIndexPaths({ listingRef: 'RX7K2P9', bedrooms: 2, type: 'apartment', listingType: 'rent', address: { neighborhood: 'Osu', city: 'Accra' } })).toEqual([
      '/property/2-bedroom-apartment-for-rent-in-osu-accra-rx7k2p9',
      '/rent', '/rent/accra', '/rent/accra/osu',
      '/rent/apartments', '/rent/accra/apartments', '/rent/accra/osu/apartments',
    ])
  })

  it('sends nothing without a key or outside production', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('INDEXNOW_KEY', '')
    expect(await submitToIndexNow(['/rent'])).toBeNull()
    vi.stubEnv('INDEXNOW_KEY', '4f2aff3b1c0b3e86528f68622534fc6c')
    vi.stubEnv('NODE_ENV', 'test')
    expect(await submitToIndexNow(['/rent'])).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('submits this host\'s URLs with the key and where it is published', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 202 })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('INDEXNOW_KEY', '4f2aff3b1c0b3e86528f68622534fc6c')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PUBLIC_BASE_URL', 'https://www.userentos.com')
    expect(await submitToIndexNow(['/rent', '/rent', 'https://www.userentos.com/blog', 'https://elsewhere.example/x'])).toEqual({ accepted: 2, failed: 0, statuses: [202] })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.indexnow.org/indexnow')
    expect(JSON.parse(init.body)).toEqual({
      host: 'www.userentos.com',
      key: '4f2aff3b1c0b3e86528f68622534fc6c',
      keyLocation: 'https://www.userentos.com/4f2aff3b1c0b3e86528f68622534fc6c.txt',
      urlList: ['https://www.userentos.com/rent', 'https://www.userentos.com/blog'],
    })
  })

  it('sends every batch even when one fails, and counts what was refused', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce({ status: 202 })
      .mockResolvedValueOnce({ status: 403 })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('INDEXNOW_KEY', '4f2aff3b1c0b3e86528f68622534fc6c')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PUBLIC_BASE_URL', 'https://www.userentos.com')
    const paths = Array.from({ length: 20_001 }, (_, i) => `/property/listing-${i}`)
    expect(await submitToIndexNow(paths)).toEqual({ accepted: 10_000, failed: 10_001, statuses: [0, 202, 403] })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).urlList).toHaveLength(1)
  })
})

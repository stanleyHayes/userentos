import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { validateSlug } from '../services/storefront.js'

const src = readFileSync(join(process.cwd(), 'src/routes/storefronts.ts'), 'utf8')

describe('slug is stored the way it was validated', () => {
  it('validateSlug accepts a slug with surrounding whitespace', () => {
    // It normalises internally, which is exactly why the caller must trim too.
    expect(validateSlug('  my-shop  ')).toEqual({ ok: true })
  })

  it('the create route trims before storing', () => {
    // Storing the untrimmed value made the storefront unreachable at its own URL.
    expect(src).toContain("parsed.data.slug.trim().toLowerCase()")
  })
})

describe('admin storefront search survives regex metacharacters', () => {
  it('escapes the search term before compiling it', () => {
    const route = src.slice(src.indexOf("router.get('/', authenticate, requireRole('admin'"))
    expect(route).toContain('escapeRegex(search)')
    expect(route).not.toMatch(/new RegExp\(search,/)
  })
})

describe('re-verification cannot take a live domain down', () => {
  it('only demotes a domain that was not already serving', () => {
    const route = src.slice(src.indexOf("router.post('/me/domains/:id/verify'"))
    const failure = route.slice(route.indexOf('if (!result.verified)'), route.indexOf('record.status = \'verified\''))
    expect(failure).toContain('wasLive')
    expect(failure).toMatch(/if \(!wasLive\) record\.status = 'pending'/)
  })
})

describe('a removed domain can be added back', () => {
  it('revives the existing row instead of inserting a duplicate', () => {
    // `domain` is uniquely indexed, so create() on a previously removed domain
    // threw a duplicate-key error and surfaced as a 500.
    const route = src.slice(src.indexOf("router.post('/me/domains'"), src.indexOf("router.post('/me/domains/:id/verify'"))
    expect(route).toContain('StorefrontDomain.findOne({ domain })')
    expect(route).toMatch(/if \(existing\)/)
  })

  it('still refuses a domain that is actively connected elsewhere', () => {
    const route = src.slice(src.indexOf("router.post('/me/domains'"), src.indexOf("router.post('/me/domains/:id/verify'"))
    expect(route).toMatch(/existing\.status !== 'removed'/)
  })
})

describe('the analytics entitlement gate fails closed', () => {
  it('allows only the tiers the registry defines', () => {
    const route = src.slice(src.indexOf("router.get('/me/analytics'"))
    expect(route).toContain('PAID_ANALYTICS_TIERS')
    // A deny-list let any unrecognised value — an admin typo — grant the feature.
    expect(route).not.toMatch(/tier === '' \|\| tier === 'none'/)
  })
})

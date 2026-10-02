import { test, expect, type Page } from '@playwright/test'
import { allRegulatedFeatures } from '../helpers/regulatedFeatures'

// A professional's RentOS website (product brief §03), as a logged-out
// visitor (its real audience), against a Vite dev server with every API
// response mocked:
//   PLAYWRIGHT_BASE_URL=http://localhost:5602 npx playwright test -c playwright.web-mocked.config.ts
test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'Requires a web dev server at PLAYWRIGHT_BASE_URL')

const base = new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5602')
const listingId = (i: number) => `64b000000000000000000${String(i).padStart(3, '0')}`
/** Shareable references are seven characters from a no-lookalikes alphabet. */
const listingRef = (i: number) => `RX${'23456789ABCDEFGHJKMNPQRSTUVWXYZ'[i % 31]}${'23456789ABCDEFGHJKMNPQRSTUVWXYZ'[Math.floor(i / 31) % 31]}K2P`
const TOTAL = 30
const storefront = {
  id: 'sf-1', slug: 'ama', name: 'Homes by Ama', tagline: 'Family homes in Accra', status: 'active', published: true, preview: false,
  services: ['Lettings'], serviceAreas: ['Osu'], gallery: [], about: 'We let family homes in Accra.', professionalType: 'agent', identityVerified: true,
  // Only the city and hours are public (contact protection): no phone, email or WhatsApp.
  branding: {}, contact: { city: 'Accra', hours: 'Mon–Sat' }, canonicalUrl: 'https://ama.userentos.com',
}
const listing = (i: number) => ({
  id: listingId(i), listingRef: listingRef(i), listingType: 'rent', title: `Listing ${i}`, rentAmount: 1000 + i, bedrooms: 2, bathrooms: 1,
  address: { city: 'Accra', region: 'Greater Accra', neighborhood: 'Osu' }, images: [],
})
const publicListing = (i: number) => ({
  id: listingId(i), ref: listingRef(i), listingType: 'rent', title: `Listing ${i}`, city: 'Accra', region: 'Greater Accra', digitalAddress: '',
  neighborhood: 'Osu', propertyType: 'apartment', rentAmount: 1000 + i, bedrooms: 2, bathrooms: 1, listingStatus: 'published', publishedAt: null,
  image: null, images: [], url: `https://userentos.com/property/${listingRef(i).toLowerCase()}`, description: 'A bright flat.', amenities: [], rules: [],
  status: 'available', furnished: false, floorArea: null, parkingSpaces: 0, availableFrom: null, landlordIdentityVerified: false, agent: null,
})

type TrackEvent = { type: string; propertyId?: string; propertyIds?: string[]; sessionId?: string }
/** Listing impressions across beacons (one batch per page of cards). */
const impressions = (events: TrackEvent[]) => events.filter(e => e.type === 'listing_impression').flatMap(e => e.propertyIds ?? (e.propertyId ? [e.propertyId] : []))

/** Answers the website APIs and records every analytics event the pages send. */
async function mockWebsiteApi(page: Page, resolvedHosts: string[] = []) {
  const events: TrackEvent[] = []
  await page.addInitScript(() => sessionStorage.setItem('rentos-splash-seen', '1'))
  await page.route('**/socket.io/**', route => route.abort())
  await page.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace(/^\/api/, '')
    const ok = (data: unknown) => route.fulfill({ json: { success: true, data } })
    if (path === '/storefronts/resolve/host') {
      resolvedHosts.push(url.searchParams.get('host') ?? '')
      return ok(url.searchParams.get('host') === 'homes-by-ama.test' ? { slug: 'ama', name: storefront.name, canonicalUrl: 'https://homes-by-ama.test' } : null)
    }
    if (path === '/storefronts/ama') return ok(storefront)
    if (path === '/storefronts/ama/posts') return ok({ items: [], total: 0 })
    if (path === '/storefronts/nobody' || path === '/storefronts/nobody/properties') {
      return route.fulfill({ status: 404, json: { success: false, error: 'Storefront not found' } })
    }
    if (path === '/agency/acme') {
      return ok({ agency: { name: 'Acme Lettings', city: 'Accra', teamMembers: [], licence: null }, listings: [{ ...listing(5), listingRef: undefined }] })
    }
    if (path === '/storefronts/ama/properties') {
      const pageNo = Number(url.searchParams.get('page'))
      const limit = Number(url.searchParams.get('limit'))
      const ids = Array.from({ length: TOTAL }, (_, i) => i).slice((pageNo - 1) * limit, pageNo * limit)
      return ok({ items: ids.map(listing), total: TOTAL, page: pageNo, limit, totalPages: Math.ceil(TOTAL / limit) })
    }
    if (path === '/storefronts/ama/track' && request.method() === 'POST') {
      events.push(request.postDataJSON() as TrackEvent)
      return ok({ recorded: true })
    }
    const detail = path.match(/^\/public\/properties\/([A-Za-z0-9]+)$/)
    if (detail) {
      const i = Array.from({ length: TOTAL }, (_, n) => n).find((n) => listingRef(n).toLowerCase() === detail[1].toLowerCase() || listingId(n) === detail[1])
      return i === undefined ? route.fulfill({ status: 404, json: { success: false, error: 'Property not found' } }) : ok(publicListing(i))
    }
    if (path === '/platform/features') return ok(allRegulatedFeatures)
    return ok({ items: [], total: 0 })
  })
  return events
}

const cards = (page: Page) => page.getByRole('link', { name: /Listing \d+/ })

test('a visitor browses the properties page by page, opens one inside the website, and is counted', async ({ page }) => {
  const events = await mockWebsiteApi(page)
  await page.goto('/s/ama')

  await expect(page.getByRole('heading', { level: 1, name: 'Homes by Ama' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('heading', { name: 'Latest listings' })).toBeVisible()
  await expect(cards(page)).toHaveCount(6)
  // Contact protection: the website never shows a phone number, email or WhatsApp link.
  await expect(page.locator('a[href^="tel:"], a[href^="mailto:"], a[href*="wa.me"]')).toHaveCount(0)
  await expect.poll(() => events.filter(e => e.type === 'view').length).toBe(1)
  await expect.poll(() => impressions(events).length).toBe(6)

  await page.getByRole('link', { name: 'Properties' }).first().click()
  await expect(page.getByText(`${TOTAL} properties`)).toBeVisible()
  await expect(cards(page)).toHaveCount(12)
  await page.getByRole('button', { name: /Next/ }).click()
  await expect(page.getByText('Page 2 of 3')).toBeVisible()
  await page.getByRole('button', { name: /Next/ }).click()
  await expect(cards(page)).toHaveCount(TOTAL - 24)
  // Every listing is counted once per visit, however many pages it took.
  await expect.poll(() => new Set(impressions(events)).size).toBe(TOTAL)
  expect(impressions(events)).toHaveLength(TOTAL)
  const sessions = new Set(events.map(e => e.sessionId))
  expect(sessions.size).toBe(1)
  expect([...sessions][0]).toMatch(/^[0-9a-f-]{36}$/)

  // A listing opens inside the website, at its shareable reference, signed out.
  const ref = listingRef(27).toLowerCase()
  await expect(page.getByRole('link', { name: /Listing 27\b/ })).toHaveAttribute('href', `/s/ama/property/${ref}`)
  await page.getByRole('link', { name: /Listing 27\b/ }).click()
  await expect(page).toHaveURL(new RegExp(`/s/ama/property/${ref}$`))
  await expect(page.getByRole('heading', { name: 'Listing 27' })).toBeVisible()
  await expect.poll(() => events.some(e => e.type === 'view' && e.propertyId === listingId(27))).toBe(true)
})

test('on a website subdomain, pages stay on the host and RentOS links go to the platform', async ({ page }) => {
  await mockWebsiteApi(page)
  const platform = `${base.protocol}//localhost:${base.port}`
  await page.goto(`${base.protocol}//ama.localhost:${base.port}/`)

  await expect(page.getByRole('heading', { level: 1, name: 'Homes by Ama' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('link', { name: /Listing 3\b/ })).toHaveAttribute('href', `/property/${listingRef(3).toLowerCase()}`)
  await expect(page.getByRole('link', { name: /Website by/ })).toHaveAttribute('href', platform)

  // Nobody is signed in on the owner's host: an enquiry continues on RentOS.
  await page.getByRole('link', { name: 'Contact' }).first().click()
  await expect(page.getByRole('link', { name: /Write to Homes by Ama on RentOS/ })).toHaveAttribute('href', `${platform}/s/ama/contact`)
})

test('a missing website on its own subdomain still links back to the platform', async ({ page }) => {
  await mockWebsiteApi(page)
  await page.goto(`${base.protocol}//nobody.localhost:${base.port}/`)

  await expect(page.getByRole('heading', { name: 'There’s no storefront here' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('link', { name: 'Go to RentOS' })).toHaveAttribute('href', `${base.protocol}//localhost:${base.port}/`)
  await expect(page.getByRole('link', { name: 'Browse rentals' })).toHaveAttribute('href', `${base.protocol}//localhost:${base.port}/registry`)
})

test('an agency page opens its listings on the public listing page', async ({ page }) => {
  await mockWebsiteApi(page)
  await page.goto('/agency/acme')

  await expect(page.getByRole('heading', { name: 'Acme Lettings' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('link', { name: /Listing 5\b/ })).toHaveAttribute('href', `/registry/${listingId(5)}`)
})

test('a custom domain names itself when asking which website it is', async ({ page }) => {
  // Serve the dev app on a made-up domain: the page believes it is on
  // homes-by-ama.test, while every file actually comes from the dev server.
  await page.route('http://homes-by-ama.test/**', async route => {
    const url = new URL(route.request().url())
    const response = await route.fetch({ url: `${base.origin}${url.pathname}${url.search}` })
    await route.fulfill({ response })
  })
  // Hold the dev server's HMR socket open; a dropped one makes Vite reload the page.
  await page.routeWebSocket(/homes-by-ama\.test/, () => {})
  const asked: string[] = []
  await mockWebsiteApi(page, asked)
  await page.goto('http://homes-by-ama.test/')

  await expect(page.getByRole('heading', { level: 1, name: 'Homes by Ama' })).toBeVisible({ timeout: 20_000 })
  expect(asked).toEqual(['homes-by-ama.test'])
  // The home page shows the latest six listings, on the owner's own host.
  await expect(page.getByRole('link', { name: /Listing 3\b/ })).toHaveAttribute('href', `/property/${listingRef(3).toLowerCase()}`)
})

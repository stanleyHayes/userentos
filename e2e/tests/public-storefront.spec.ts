import { test, expect, type Page } from '@playwright/test'
import { allRegulatedFeatures } from '../helpers/regulatedFeatures'

// Runs against a Vite dev server with every API response mocked, as a
// logged-out visitor (the storefront's real audience):
//   PLAYWRIGHT_BASE_URL=http://localhost:5602 npx playwright test -c playwright.web-mocked.config.ts
test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'Requires a web dev server at PLAYWRIGHT_BASE_URL')

const base = new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5602')
const listingId = (i: number) => `64b000000000000000000${String(i).padStart(3, '0')}`
const TOTAL = 30
const storefront = {
  id: 'sf-1', slug: 'ama', name: 'Homes by Ama', tagline: 'Family homes in Accra', status: 'active',
  branding: {}, contact: { phone: '0241234567', email: 'ama@homes.test', city: 'Accra' }, canonicalUrl: 'https://ama.userentos.com',
}
const listing = (i: number) => ({
  id: listingId(i), title: `Listing ${i}`, rentAmount: 1000 + i, bedrooms: 2, bathrooms: 1,
  address: { city: 'Accra', region: 'Greater Accra' }, images: [],
})

type TrackEvent = { type: string; propertyId?: string; channel?: string; sessionId?: string }

/** Answers the storefront and agency APIs and records every storefront analytics event the page sends. */
async function mockStorefrontApi(page: Page, resolvedHosts: string[] = []) {
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
    if (path === '/storefronts/nobody' || path === '/storefronts/nobody/properties') {
      return route.fulfill({ status: 404, json: { success: false, error: 'Storefront not found' } })
    }
    if (path === '/agency/acme') {
      return ok({ agency: { name: 'Acme Lettings', phone: '0241234567', city: 'Accra', teamMembers: [], licence: null }, listings: [listing(5)] })
    }
    if (path === '/storefronts/ama/properties') {
      const page = Number(url.searchParams.get('page'))
      const limit = Number(url.searchParams.get('limit'))
      const ids = Array.from({ length: TOTAL }, (_, i) => i).slice((page - 1) * limit, page * limit)
      return ok({ items: ids.map(listing), total: TOTAL, page, limit, totalPages: Math.ceil(TOTAL / limit) })
    }
    if (path === '/storefronts/ama/track' && request.method() === 'POST') {
      events.push(request.postDataJSON() as TrackEvent)
      return ok({ recorded: true })
    }
    const registry = path.match(/^\/public\/properties\/([a-f0-9]{24})$/)
    if (registry) {
      return ok({ id: registry[1], title: `Listing ${Number(registry[1].slice(-3))}`, city: 'Accra', region: 'Greater Accra', digitalAddress: '', neighborhood: '', propertyType: 'apartment', rentAmount: 1000, bedrooms: 2, bathrooms: 1, listingStatus: 'published', publishedAt: null, image: null })
    }
    if (path === '/platform/features') return ok(allRegulatedFeatures)
    return ok({ items: [], total: 0 })
  })
  return events
}

const cards = (page: Page) => page.getByRole('link', { name: /Listing \d+/ })

test('a visitor sees every listing, opens one without signing in, and is counted', async ({ page }) => {
  const events = await mockStorefrontApi(page)
  await page.goto('/s/ama')

  await expect(page.getByRole('heading', { name: 'Homes by Ama' })).toBeVisible({ timeout: 20_000 })
  // The whole catalogue is counted and reachable, not just the first page.
  await expect(page.getByText(`${TOTAL} listings`)).toBeVisible()
  await expect(cards(page)).toHaveCount(24)
  await page.getByRole('button', { name: 'Load more listings' }).click()
  await expect(cards(page)).toHaveCount(TOTAL)
  await expect(page.getByRole('button', { name: 'Load more listings' })).toHaveCount(0)

  // Public listing pages, not the sign-in-only /properties/:id.
  await expect(page.getByRole('link', { name: /Listing 7\b/ })).toHaveAttribute('href', `/registry/${listingId(7)}`)
  await expect(page.getByRole('link', { name: 'RentOS' })).toHaveAttribute('href', '/')

  // One storefront view and one impression per listing, all from one visitor.
  await expect.poll(() => events.filter(e => e.type === 'listing_impression').length).toBe(TOTAL)
  expect(events.filter(e => e.type === 'view')).toHaveLength(1)
  expect(new Set(events.filter(e => e.type === 'listing_impression').map(e => e.propertyId)).size).toBe(TOTAL)
  const sessions = new Set(events.map(e => e.sessionId))
  expect(sessions.size).toBe(1)
  expect([...sessions][0]).toMatch(/^[0-9a-f-]{36}$/)

  // Contact clicks name their channel. (Keep the browser from opening a dialer or mail app.)
  await page.evaluate(() => document.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a[href^="tel:"], a[href^="mailto:"]')) e.preventDefault()
  }, true))
  await page.getByRole('link', { name: '0241234567' }).click()
  await page.getByRole('link', { name: 'ama@homes.test' }).click()
  await expect.poll(() => events.filter(e => e.type === 'contact_click').map(e => e.channel)).toEqual(['phone', 'email'])

  // A reload is a new view, but the same listings are not counted as seen again.
  await page.reload()
  await expect(cards(page)).toHaveCount(24)
  await expect.poll(() => events.filter(e => e.type === 'view' && !e.propertyId).length).toBe(2)
  expect(events.filter(e => e.type === 'listing_impression')).toHaveLength(TOTAL)

  // Opening a listing feeds "Top listings" and shows it to a signed-out visitor.
  await page.getByRole('link', { name: /Listing 3\b/ }).click()
  await expect(page).toHaveURL(new RegExp(`/registry/${listingId(3)}$`))
  await expect(page.getByRole('heading', { name: 'Listing 3' })).toBeVisible()
  await expect.poll(() => events.some(e => e.type === 'view' && e.propertyId === listingId(3))).toBe(true)
})

test('on a storefront subdomain, listing and RentOS links go to the platform, not the seller host', async ({ page }) => {
  await mockStorefrontApi(page)
  const platform = `${base.protocol}//localhost:${base.port}`
  await page.goto(`${base.protocol}//ama.localhost:${base.port}/`)

  await expect(page.getByRole('heading', { name: 'Homes by Ama' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('link', { name: /Listing 7\b/ })).toHaveAttribute('href', `${platform}/registry/${listingId(7)}`)
  await expect(page.getByRole('link', { name: 'RentOS' })).toHaveAttribute('href', `${platform}/`)
})

test('a missing storefront on its own subdomain still links back to the platform', async ({ page }) => {
  await mockStorefrontApi(page)
  await page.goto(`${base.protocol}//nobody.localhost:${base.port}/`)

  await expect(page.getByRole('heading', { name: 'There’s no storefront here' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('link', { name: 'Go to RentOS' })).toHaveAttribute('href', `${base.protocol}//localhost:${base.port}/`)
  await expect(page.getByRole('link', { name: 'Browse rentals' })).toHaveAttribute('href', `${base.protocol}//localhost:${base.port}/registry`)
})

test('an agency page opens its listings on the public listing page', async ({ page }) => {
  await mockStorefrontApi(page)
  await page.goto('/agency/acme')

  await expect(page.getByRole('heading', { name: 'Acme Lettings' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('link', { name: /Listing 5\b/ })).toHaveAttribute('href', `/registry/${listingId(5)}`)
})

test('a custom domain names itself when asking which storefront it is', async ({ page }) => {
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
  await mockStorefrontApi(page, asked)
  await page.goto('http://homes-by-ama.test/')

  await expect(page.getByRole('heading', { name: 'Homes by Ama' })).toBeVisible({ timeout: 20_000 })
  expect(asked).toEqual(['homes-by-ama.test'])
  await expect(page.getByRole('link', { name: /Listing 7\b/ })).toHaveAttribute('href', `https://userentos.com/registry/${listingId(7)}`)
})

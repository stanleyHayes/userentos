import { test, expect, type Page } from '@playwright/test'
import { allRegulatedFeatures } from '../helpers/regulatedFeatures'

// The apps declare no ads (Google Play "Contains ads: No"), so they must never
// ask the API for paid placements. These pin that, and that the labels are in
// place for the day a screen does opt in.
const mobileUrl = process.env.MOBILE_WEB_URL
test.skip(!mobileUrl, 'Requires Expo web at MOBILE_WEB_URL')

const tenant = { id: '507f1f77bcf86cd799439261', email: 'noads@rentos.test', firstName: 'Kwesi', lastName: 'Tenant', phone: '0241234567', roles: ['tenant'], activeRole: 'tenant', isVerified: true }
const property = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id, title, description: 'Fixture listing', type: 'apartment', status: 'available', listingStatus: 'approved',
  address: { street: '1 Fixture Rd', city: 'Accra', region: 'Greater Accra' }, rentAmount: 2500, amenities: [], images: [], ...extra,
})
const paid = property('507f1f77bcf86cd799439271', 'Paid Flat in Osu', { sponsored: true, sponsorshipId: 'camp-1' })
const organic = property('507f1f77bcf86cd799439272', 'Organic Flat in Labone')
const businessId = '507f1f77bcf86cd799439281'
const directory = {
  items: [{
    business: { id: businessId, ownerId: '507f1f77bcf86cd799439282', name: 'Paid Furniture Co', category: 'furniture', phone: '0241234567', city: 'Accra', isVerified: true, createdAt: '2026-09-01T00:00:00.000Z' },
    listings: [{ id: 'listing-1', businessId, title: 'Welcome discount', type: 'discount', promoText: '15% off', isActive: true, newMoverOnly: true, createdAt: '2026-09-01T00:00:00.000Z' }],
    // What the API would add for placement=directory. The app never asks, but
    // must still label it if a paid item ever arrives.
    isFeatured: true,
  }],
}

async function signIn(page: Page) {
  const requests: URL[] = []
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    requests.push(url)
    let data: unknown = { items: [], total: 0 }
    if (url.pathname === '/api/auth/login') data = { user: tenant, token: 'noads-token', refreshToken: 'noads-refresh' }
    else if (url.pathname === '/api/users/me') data = tenant
    else if (url.pathname === '/api/platform/features') data = allRegulatedFeatures
    else if (url.pathname === '/api/chat/unread-count') data = { count: 0 }
    else if (url.pathname === '/api/properties/favorites/me') data = { propertyIds: [organic.id], items: [organic], total: 1 }
    else if (url.pathname === `/api/properties/${organic.id}`) data = organic
    else if (url.pathname === '/api/properties') data = { items: [paid, organic], total: 2 }
    else if (url.pathname === '/api/businesses') data = directory
    await route.fulfill({ json: { success: true, data } })
  })
  await page.goto(`${mobileUrl}/auth/login`)
  await page.getByPlaceholder('you@example.com').fill(tenant.email)
  await page.getByPlaceholder('Enter your password').fill('E2e!Password123')
  await page.getByText('Sign in', { exact: true }).click()
  return requests
}

test('home shows saved properties from the favourites endpoint, never the whole listing', async ({ page }) => {
  const requests = await signIn(page)
  await expect(page.getByText('Saved Properties', { exact: true })).toBeVisible()
  await expect(page.getByText(organic.title, { exact: true }).first()).toBeVisible()
  expect(requests.some((u) => u.pathname === '/api/properties/favorites/me')).toBe(true)
  expect(requests.filter((u) => u.pathname === '/api/properties')).toEqual([])
})

test('the properties tab asks for no paid placements, and labels one if the server sends it', async ({ page }) => {
  const requests = await signIn(page)
  await page.getByText('Properties', { exact: true }).last().click()
  await expect(page.getByText(paid.title, { exact: true })).toBeVisible()

  await expect(page.getByTestId('sponsored-badge')).toHaveCount(1)
  await expect(page.getByLabel('Sponsored listing')).toBeVisible()
  const lists = requests.filter((u) => u.pathname === '/api/properties')
  expect(lists.length).toBeGreaterThan(0)
  expect(lists.every((u) => !u.searchParams.has('placement'))).toBe(true)
})

test('local services asks for organic order, labels a paid business and tags new-mover offers', async ({ page }) => {
  const requests = await signIn(page)
  await page.getByText('Profile', { exact: true }).last().click()
  await page.getByText('Local Services', { exact: true }).first().click()
  await expect(page.getByText('Paid Furniture Co', { exact: true })).toBeVisible()

  await expect(page.getByLabel('Sponsored business')).toBeVisible()
  await expect(page.getByText('For new movers', { exact: true })).toBeVisible()
  const lists = requests.filter((u) => u.pathname === '/api/businesses')
  expect(lists.length).toBeGreaterThan(0)
  expect(lists.every((u) => !u.searchParams.has('placement'))).toBe(true)
})

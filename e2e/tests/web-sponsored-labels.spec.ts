import { test, expect, type Page } from '@playwright/test'
import { signInWithMockedApi } from '../helpers/mockedWeb'

// Runs against a Vite dev server with every API response mocked:
//   PLAYWRIGHT_BASE_URL=http://localhost:5602 npx playwright test -c playwright.web-mocked.config.ts
test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'Requires a web dev server at PLAYWRIGHT_BASE_URL')

const tenant = { id: '507f1f77bcf86cd799439161', email: 'browse@rentos.test', firstName: 'Abena', lastName: 'Browser', phone: '0241234567', roles: ['tenant'], activeRole: 'tenant' }
const landlord = { ...tenant, id: '507f1f77bcf86cd799439162', email: 'owner@rentos.test', roles: ['landlord'], activeRole: 'landlord' }

const property = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id, _id: id, title, description: 'Fixture listing', type: 'apartment', status: 'available', listingStatus: 'approved',
  address: { street: '1 Fixture Rd', city: 'Accra', region: 'Greater Accra' }, rentAmount: 2500, advanceMonths: 6, rentDurationMonths: 12,
  amenities: [], rules: [], images: [], bedrooms: 2, bathrooms: 1, landlordId: '507f1f77bcf86cd799439170', views: 0, ...extra,
})
const sponsored = property('507f1f77bcf86cd799439171', 'Paid Flat in Osu', { sponsored: true, sponsorshipId: 'camp-1' })
const organic = property('507f1f77bcf86cd799439172', 'Organic Flat in Labone')

/** Every query string the page sent to a list endpoint, e.g. "/properties". */
function recordQueries(page: Page, path: string) {
  const seen: URLSearchParams[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname === `/api${path}`) seen.push(url.searchParams)
  })
  return seen
}

test('a sponsored listing is labelled in both grid and list views, and only the browse page asks for one', async ({ page }) => {
  const queries = recordQueries(page, '/properties')
  await signInWithMockedApi(page, tenant, ({ path }) => (path === '/properties' ? { data: { items: [sponsored, organic], total: 2 } } : undefined))
  await page.goto('/properties')

  const cards = page.getByTestId('property-card')
  await expect(cards).toHaveCount(2, { timeout: 20_000 })
  await expect(cards.nth(0).getByTestId('sponsored-badge')).toHaveText('Sponsored')
  await expect(cards.nth(1).getByTestId('sponsored-badge')).toHaveCount(0)
  expect(queries.some((q) => q.get('placement') === 'search_top')).toBe(true)

  await page.locator('[data-tab-key=list]').click()
  await expect(cards.nth(0).getByTestId('sponsored-badge')).toHaveText('Sponsored')
  await expect(cards.nth(1).getByTestId('sponsored-badge')).toHaveCount(0)

  // Screen readers get the word, not the icon: it is part of the card link's
  // accessible name, and the megaphone is hidden from assistive tech.
  await expect(page.getByRole('link', { name: /Sponsored/ })).toHaveCount(1)
  await expect(cards.nth(0).getByTestId('sponsored-badge').locator('svg')).toHaveAttribute('aria-hidden', 'true')
})

test('a landlord\'s own portfolio never asks for paid placements', async ({ page }) => {
  const queries = recordQueries(page, '/properties')
  await signInWithMockedApi(page, landlord, ({ path }) => (path === '/properties' ? { data: { items: [organic], total: 1 } } : undefined))
  await page.goto('/properties')

  await expect(page.getByTestId('property-card')).toHaveCount(1, { timeout: 20_000 })
  expect(queries.length).toBeGreaterThan(0)
  expect(queries.every((q) => q.get('mine') === 'true' && !q.has('placement'))).toBe(true)
})

const businessId = '507f1f77bcf86cd799439181'
const directoryItem = (isFeatured?: boolean) => ({
  business: {
    id: businessId, ownerId: '507f1f77bcf86cd799439182', name: 'Paid Furniture Co', category: 'furniture', phone: '0241234567', city: 'Accra',
    isVerified: true, viewCount: 0, ratingAvg: 0, reviewCount: 0, subscriptionTier: 'featured', featuredUntil: '2099-01-01T00:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z',
  },
  listings: [
    { id: 'listing-1', businessId, title: 'Welcome discount', type: 'discount', promoText: '15% off', isActive: true, images: [], newMoverOnly: true, createdAt: '2026-09-01T00:00:00.000Z' },
  ],
  ...(isFeatured === undefined ? {} : { isFeatured }),
})

test('local services labels a paid business "Sponsored" and tags new-mover offers', async ({ page }) => {
  const queries = recordQueries(page, '/businesses')
  await signInWithMockedApi(page, tenant, ({ path }) => {
    if (path === '/businesses') return { data: { items: [directoryItem(true)] } }
    if (path === `/businesses/${businessId}`) return { data: directoryItem() }
    return undefined
  })
  await page.goto('/local-services')

  const card = page.getByTestId('business-card')
  await expect(card).toHaveCount(1, { timeout: 20_000 })
  await expect(card.getByTestId('sponsored-badge')).toHaveText('Sponsored')
  await expect(card.getByText('Featured', { exact: true })).toHaveCount(0)
  await expect(card.getByText('For new movers', { exact: true })).toBeVisible()
  expect(queries.some((q) => q.get('placement') === 'directory')).toBe(true)
})

test('the agreement page\'s move-in essentials stay in organic order', async ({ page }) => {
  const agreementId = '507f1f77bcf86cd799439191'
  const propertyId = '507f1f77bcf86cd799439192'
  const queries = recordQueries(page, '/businesses')
  await signInWithMockedApi(page, tenant, ({ path }) => {
    if (path === `/agreements/${agreementId}`) {
      return { data: {
        id: agreementId, _id: agreementId, propertyId, landlordId: '507f1f77bcf86cd799439193', tenantId: tenant.id, status: 'active',
        startDate: '2026-09-01', endDate: '2027-09-01', rentAmount: 2500, securityDeposit: 2500, advanceMonths: 6, terms: [], specialConditions: [],
        landlordSignature: '2026-08-30T10:00:00.000Z', tenantSignature: '2026-08-31T10:00:00.000Z', signatureEvidence: [], complianceFlags: [],
        version: 1, renewalStatus: 'none', termsHash: 'a'.repeat(64), createdAt: '2026-08-29T10:00:00.000Z', updatedAt: '2026-08-31T10:00:00.000Z',
      } }
    }
    if (path === `/properties/${propertyId}`) return { data: property(propertyId, 'Leased Flat') }
    if (path === '/businesses') return { data: { items: [directoryItem()] } }
    return undefined
  })
  await page.goto(`/agreements/${agreementId}`)

  await expect(page.getByText('Move-in essentials near Accra')).toBeVisible({ timeout: 20_000 })
  expect(queries.length).toBeGreaterThan(0)
  expect(queries.every((q) => q.get('city') === 'Accra' && !q.has('placement'))).toBe(true)
})

test('the privacy policy describes paid placements', async ({ page }) => {
  await page.goto('/privacy')
  await expect(page.getByText(/Some listings and businesses are paid placements and are labelled Sponsored\./)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/not from your profile or history/)).toBeVisible()
  await expect(page.getByText(/The RentOS mobile apps do not show paid placements\./)).toBeVisible()
})

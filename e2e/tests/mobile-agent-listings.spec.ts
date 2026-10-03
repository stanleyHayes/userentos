import { test, expect, type Page } from '@playwright/test'
import { noRegulatedFeatures } from '../helpers/regulatedFeatures'

const mobileUrl = process.env.MOBILE_WEB_URL
test.skip(!mobileUrl, 'Requires Expo web at MOBILE_WEB_URL')

/*
 * Agents on mobile could not find their own listings (the Properties tab
 * browsed the marketplace only), were told a new listing was "listed" when it
 * was a draft, met the plan limit only after filling in the whole form, and
 * could not resubmit a listing the reviewer sent back for changes.
 */
const agent = { id: '507f1f77bcf86cd799439041', email: 'agent@listings.rentos.test', firstName: 'Listing', lastName: 'Agent', phone: '0241234567', roles: ['property_manager'], activeRole: 'property_manager', isVerified: true }
const listing = (id: string, title: string, listingStatus: string, extra: Record<string, unknown> = {}) => ({
  id, title, listingStatus, landlordId: agent.id, description: 'Two bedrooms near the mall.', type: 'apartment', listingType: 'rent', status: 'available',
  address: { street: '4 Ring Road', city: 'Accra', region: 'Greater Accra' }, rentAmount: 2500, amenities: [], images: [], ...extra,
})

type Handler = (request: { method: string; path: string; search: URLSearchParams }) => unknown | undefined
async function signIn(page: Page, handle: Handler) {
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url())
    const answer = handle({ method: route.request().method(), path: url.pathname, search: url.searchParams })
    const data = answer !== undefined ? answer
      : url.pathname === '/api/auth/login' ? { user: agent, token: 'listing-token', refreshToken: 'listing-refresh' }
        : url.pathname === '/api/users/me' ? agent
          : url.pathname === '/api/platform/features' ? noRegulatedFeatures
            : url.pathname === '/api/chat/unread-count' ? { count: 0 }
              : url.pathname.startsWith('/api/reviews/property/') ? { reviews: [] } : { items: [], total: 0 }
    return route.fulfill({ json: { success: true, data } })
  })
  await page.goto(`${mobileUrl}/auth/login`)
  await page.getByPlaceholder('you@example.com').fill(agent.email)
  await page.getByPlaceholder('Enter your password').fill('E2e!Password123')
  await page.getByText('Sign in', { exact: true }).click()
  await expect(page.getByText('Profile', { exact: true }).last()).toBeVisible()
}

const shown = (page: Page, text: string) => page.getByText(text, { exact: true }).filter({ visible: true })
const open = (page: Page, path: string) => page.evaluate((to) => { window.history.pushState({}, '', to); window.dispatchEvent(new PopStateEvent('popstate')) }, path)

test('the Properties tab opens on the agent’s own listings, with where each is in review', async ({ page }) => {
  const asked: string[] = []
  await signIn(page, ({ path, search }) => {
    if (path !== '/api/properties') return undefined
    asked.push(search.get('mine') ?? 'browse')
    return search.get('mine') === 'true'
      ? { items: [listing('p1', 'Osu draft flat', 'draft'), listing('p2', 'Airport studio', 'changes_requested')], total: 2 }
      : { items: [listing('p3', 'Marketplace house', 'approved', { landlordId: 'someone-else' })], total: 1 }
  })
  await page.getByText('Properties', { exact: true }).last().click()
  await expect(shown(page, 'Osu draft flat')).toBeVisible()
  await expect(shown(page, 'Draft')).toBeVisible()
  await expect(shown(page, 'Changes Requested')).toBeVisible()
  expect(asked[0]).toBe('true')

  await shown(page, 'Browse').click()
  await expect(shown(page, 'Marketplace house')).toBeVisible()
  expect(asked.at(-1)).toBe('browse')
})

test('a listing sent back for changes shows the reviewer’s issues and can be resubmitted', async ({ page }) => {
  let resubmitted = false
  await signIn(page, ({ method, path }) => {
    if (path === '/api/properties/p2' && method === 'GET') {
      return resubmitted ? listing('p2', 'Airport studio', 'pending_review') : listing('p2', 'Airport studio', 'changes_requested', { reviewIssues: ['Add a photo of the kitchen'] })
    }
    if (path === '/api/properties/p2/publish' && method === 'POST') { resubmitted = true; return { listingStatus: 'pending_review' } }
    return undefined
  })
  await open(page, '/property/p2')
  await expect(shown(page, '• Add a photo of the kitchen')).toBeVisible()
  await shown(page, 'Resubmit for review').click()
  await expect(shown(page, 'With RentOS for review')).toBeVisible()
  expect(resubmitted).toBe(true)
})

test('at the plan limit the form says so, with an upgrade link, before anything is filled in', async ({ page }) => {
  await signIn(page, ({ path }) => path === '/api/subscriptions/my-subscription'
    ? { propertyCount: 3, maxProperties: 3, canAddProperty: false, isExpired: false }
    : undefined)
  await open(page, '/add-property')
  await expect(shown(page, '3 of 3 listings used')).toBeVisible()
  await expect(shown(page, 'Your plan is full. Upgrade to add another listing.')).toBeVisible()
  await expect(shown(page, 'Upgrade')).toBeVisible()
  await expect(shown(page, 'Plan limit reached')).toBeVisible()
})

test('a new listing opens as a draft, with Submit for review as the next step', async ({ page }) => {
  let created = false
  await signIn(page, ({ method, path }) => {
    if (path === '/api/subscriptions/my-subscription') return { propertyCount: 0, maxProperties: 3, canAddProperty: true, isExpired: false }
    if (path === '/api/properties' && method === 'POST') { created = true; return listing('new1', 'Labone flat', 'draft') }
    if (path === '/api/properties/new1' && method === 'GET') return listing('new1', 'Labone flat', 'draft')
    return undefined
  })
  await open(page, '/add-property')
  await expect(shown(page, '0 of 3 listings used')).toBeVisible()
  await page.getByPlaceholder('e.g. 2-Bedroom Apartment, East Legon').fill('Labone flat')
  await page.getByPlaceholder('Describe the property...').fill('Bright two-bedroom flat close to the junction.')
  await page.getByPlaceholder('e.g. 14 Oxford Street').fill('9 Labone Crescent')
  await page.getByPlaceholder('e.g. Osu').fill('Labone')
  await page.getByPlaceholder('e.g. 2500').fill('3000')
  await shown(page, 'Save listing').click()
  await expect(shown(page, 'Submit for review')).toBeVisible()
  await expect(shown(page, 'Drafts are only visible to you. RentOS reviews each listing before it goes live.')).toBeVisible()
  expect(created).toBe(true)
})

import { test, expect, type Page } from '@playwright/test'
import { noRegulatedFeatures } from '../helpers/regulatedFeatures'

const mobileUrl = process.env.MOBILE_WEB_URL
test.skip(!mobileUrl, 'Requires Expo web at MOBILE_WEB_URL')

/*
 * Agents on mobile hit screens that don't exist or do nothing: a new agent
 * landed on "Page not found", Verify Identity opened the tenant profile,
 * Maintenance offered a request form the API refuses, and tapping a
 * notification only marked it read.
 */
type Role = 'tenant' | 'property_manager'
type Handler = (request: { method: string; path: string }) => unknown | undefined
const userFor = (role: Role) => ({ id: '507f1f77bcf86cd799439031', email: `${role}@journeys.rentos.test`, firstName: 'Journey', lastName: 'Fixture', phone: '0241234567', roles: [role], activeRole: role, isVerified: false })

async function mockApi(page: Page, role: Role, handle: Handler = () => undefined) {
  const user = userFor(role)
  await page.route('**/api/**', route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const answer = handle({ method: request.method(), path })
    const data = answer !== undefined ? answer
      : path === '/api/auth/login' || path === '/api/auth/register' ? { user, token: 'journey-token', refreshToken: 'journey-refresh' }
        : path === '/api/users/me' ? user
          : path === '/api/platform/features' ? noRegulatedFeatures
            : path === '/api/chat/unread-count' ? { count: 0 } : { items: [], total: 0 }
    return route.fulfill({ json: { success: true, data } })
  })
}

async function signIn(page: Page, role: Role, handle?: Handler) {
  await mockApi(page, role, handle)
  await page.goto(`${mobileUrl}/auth/login`)
  await page.getByPlaceholder('you@example.com').fill(userFor(role).email)
  await page.getByPlaceholder('Enter your password').fill('E2e!Password123')
  await page.getByText('Sign in', { exact: true }).click()
  await expect(page.getByText('Profile', { exact: true }).last()).toBeVisible()
}

// Home, still mounted behind other tabs, repeats some labels: use what is on screen.
const shown = (page: Page, text: string) => page.getByText(text, { exact: true }).filter({ visible: true })

async function openProfileItem(page: Page, label: string) {
  await page.getByText('Profile', { exact: true }).last().click()
  await shown(page, label).click()
}

test('a new agent lands on My website, which offers to set the website up', async ({ page }) => {
  await mockApi(page, 'property_manager', ({ path }) => path === '/api/storefronts/me' ? null : undefined)
  await page.goto(`${mobileUrl}/auth/register`)
  await page.getByText('Agent / Agency / Property Manager', { exact: true }).click()
  await page.getByText('Continue', { exact: true }).click()
  await page.getByPlaceholder('Kwame').fill('Journey')
  await page.getByPlaceholder('Asante').fill('Fixture')
  await page.getByPlaceholder('you@example.com').fill('property_manager@journeys.rentos.test')
  await page.getByPlaceholder('024 XXX XXXX').fill('0241234567')
  await page.getByPlaceholder('Min 8 characters').fill('E2e!Password123')
  await page.getByLabel('I am 18 or older and agree to the Terms of Service and Privacy Policy').click()
  await page.getByText('Create account', { exact: true }).click()
  await expect(shown(page, 'Set up your website')).toBeVisible()
  await expect(page.getByText('Page not found')).toHaveCount(0)
})

test('a new tenant lands on the property search, not Home', async ({ page }) => {
  // The sign-up screen used to navigate on its own and lose the race with the auth guard, which sent everyone Home.
  await mockApi(page, 'tenant')
  await page.goto(`${mobileUrl}/auth/register`)
  await page.getByText('Tenant', { exact: true }).click()
  await page.getByText('Continue', { exact: true }).click()
  await page.getByPlaceholder('Kwame').fill('Journey')
  await page.getByPlaceholder('Asante').fill('Fixture')
  await page.getByPlaceholder('you@example.com').fill('tenant@journeys.rentos.test')
  await page.getByPlaceholder('024 XXX XXXX').fill('0241234567')
  await page.getByPlaceholder('Min 8 characters').fill('E2e!Password123')
  await page.getByLabel('I am 18 or older and agree to the Terms of Service and Privacy Policy').click()
  await page.getByText('Create account', { exact: true }).click()
  await expect(page.getByPlaceholder('Search properties...').filter({ visible: true })).toBeVisible()
})

test('the Home "My Website" tile opens My website', async ({ page }) => {
  await signIn(page, 'property_manager', ({ path }) => path === '/api/storefronts/me' ? null : undefined)
  await page.getByText('Home', { exact: true }).last().click()
  await shown(page, 'My Website').click()
  await expect(shown(page, 'Set up your website')).toBeVisible()
})

test('an agent verifies their identity from Settings', async ({ page }) => {
  const requested: string[] = []
  await signIn(page, 'property_manager', ({ method, path }) => {
    if (path === '/api/users/me' && method === 'GET') return { ...userFor('property_manager'), ghanaCardId: 'GHA-123456789-0', verificationStatus: 'none' }
    if (path === '/api/users/me/request-verification' && method === 'POST') { requested.push(path); return { verificationStatus: 'pending' } }
    return undefined
  })
  await openProfileItem(page, 'Verify Identity')
  await expect(shown(page, 'Identity not verified')).toBeVisible()
  await shown(page, 'Request ID review').click()
  await expect(shown(page, 'ID review in progress')).toBeVisible()
  expect(requested).toEqual(['/api/users/me/request-verification'])
  await expect(page.getByText('Tenant Profile')).toHaveCount(0)
})

test('agents reach Maintenance from Profile without a request form; tenants can still raise one', async ({ page, context }) => {
  await signIn(page, 'property_manager')
  await openProfileItem(page, 'Maintenance')
  await expect(shown(page, 'Maintenance').first()).toBeVisible()
  await expect(page.getByText('New Request', { exact: true })).toHaveCount(0)

  const tenantPage = await context.newPage()
  await signIn(tenantPage, 'tenant')
  await tenantPage.evaluate(() => { window.history.pushState({}, '', '/maintenance'); window.dispatchEvent(new PopStateEvent('popstate')) })
  await expect(shown(tenantPage, 'New Request')).toBeVisible()
})

test('tapping a notification marks it read and opens what it is about', async ({ page }) => {
  const read: string[] = []
  await signIn(page, 'property_manager', ({ method, path }) => {
    if (path === '/api/notifications' && method === 'GET') {
      return { items: [
        { id: 'n1', title: 'New lead on Osu flat', message: 'Ama asked about viewing.', type: 'system', read: false, createdAt: '2026-10-02T09:00:00.000Z', actionUrl: '/agent/leads' },
        { id: 'n2', title: 'Agreement signed', message: 'Both parties signed.', type: 'agreement', read: true, createdAt: '2026-10-01T09:00:00.000Z', actionUrl: '/agreements/abc123' },
      ], total: 2 }
    }
    if (method === 'PATCH' && path.startsWith('/api/notifications/')) { read.push(path); return {} }
    return undefined
  })
  await openProfileItem(page, 'Notifications')
  await shown(page, 'New lead on Osu flat').click()
  await expect(shown(page, 'No leads yet')).toBeVisible()
  expect(read).toEqual(['/api/notifications/n1/read'])

  await page.goBack()
  await shown(page, 'Agreement signed').click()
  await expect(shown(page, 'No agreements found')).toBeVisible()
  // Already read: no second request.
  expect(read).toEqual(['/api/notifications/n1/read'])
})

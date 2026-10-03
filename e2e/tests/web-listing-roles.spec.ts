import { test, expect } from '@playwright/test'
import { signInWithMockedApi } from '../helpers/mockedWeb'

// Runs against a Vite dev server with every API response mocked:
//   PLAYWRIGHT_BASE_URL=http://localhost:5602 npx playwright test -c playwright.web-mocked.config.ts
test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'Requires a web dev server at PLAYWRIGHT_BASE_URL')

const tenant = { id: '507f1f77bcf86cd799439501', email: 'tenant@rentos.test', firstName: 'Ama', lastName: 'Tenant', phone: '0241234567', roles: ['tenant'], activeRole: 'tenant' }
const agent = { ...tenant, id: '507f1f77bcf86cd799439502', email: 'agent@rentos.test', firstName: 'Kwadwo', roles: ['property_manager'], activeRole: 'property_manager' }
const business = { ...tenant, id: '507f1f77bcf86cd799439503', email: 'shop@rentos.test', firstName: 'Kofi', roles: ['business'], activeRole: 'business' }

test('a tenant cannot open the listing form or website set-up by typing the address', async ({ page }) => {
  await signInWithMockedApi(page, tenant, () => undefined)
  for (const path of ['/properties/new', '/onboarding']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 })
  }
})

test('the property map offers "Add a property" to agents only', async ({ page }) => {
  await signInWithMockedApi(page, tenant, () => undefined)
  await page.goto('/properties/map')
  await expect(page.getByText('No listings to plot yet')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('link', { name: 'Add a property' })).toHaveCount(0)
})

test('agents no longer see seller Payouts in their menu', async ({ page }) => {
  await signInWithMockedApi(page, agent, () => undefined)
  await page.goto('/dashboard')
  await expect(page.getByRole('link', { name: 'Subscription' }).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('link', { name: 'Payouts', exact: true })).toHaveCount(0)
})

test('a signed-out visit to website set-up goes to sign-in, so the wizard can follow', async ({ page }) => {
  await page.goto('/onboarding')
  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 })
  expect(await page.evaluate(() => sessionStorage.getItem('postAuthRedirect'))).toBe('/onboarding')
})

test('an agent can open the listing form', async ({ page }) => {
  await signInWithMockedApi(page, agent, () => undefined)
  await page.goto('/properties/new')
  await expect(page).toHaveURL(/\/properties\/new$/, { timeout: 20_000 })
})

test('a business account is told websites come later instead of a form that would fail', async ({ page }) => {
  await signInWithMockedApi(page, business, ({ method, path }) => (method === 'GET' && path === '/storefronts/me' ? { data: null } : undefined))
  await page.goto('/storefront')
  await expect(page.getByText('Websites are coming later for your account')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Create storefront' })).toHaveCount(0)
})

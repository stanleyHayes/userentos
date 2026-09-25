import { test, expect, type Page } from '@playwright/test'
import { noRegulatedFeatures } from '../helpers/regulatedFeatures'

const mobileUrl = process.env.MOBILE_WEB_URL
test.skip(!mobileUrl, 'Requires Expo web at MOBILE_WEB_URL')

async function signIn(page: Page, features: unknown, requests: string[]) {
  const user = { id: '507f1f77bcf86cd799439011', email: 'regulated@rentos.test', firstName: 'Regulated', lastName: 'Fixture', phone: '0241234567', roles: ['tenant'], activeRole: 'tenant', isVerified: true }
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    requests.push(path)
    const data = path === '/api/auth/login' ? { user, token: 'regulated-token', refreshToken: 'regulated-refresh' }
      : path === '/api/users/me' ? user
        : path === '/api/platform/features' ? features
          : path === '/api/chat/unread-count' ? { count: 0 } : { items: [], total: 0 }
    return route.fulfill({ json: { success: true, data } })
  })
  await page.goto(`${mobileUrl}/auth/login`)
  await page.getByPlaceholder('you@example.com').fill(user.email)
  await page.getByPlaceholder('Enter your password').fill('E2e!Password123')
  await page.getByText('Sign in', { exact: true }).click()
  await expect(page.getByText('Profile', { exact: true }).last()).toBeVisible()
}

test('unlicensed regulated services are hidden and refuse direct navigation', async ({ page }) => {
  const requests: string[] = []
  await signIn(page, noRegulatedFeatures, requests)
  await expect(page.getByText('RentGuard', { exact: true })).toHaveCount(0)
  await page.getByText('Profile', { exact: true }).last().click()
  await expect(page.getByText('Edit Profile', { exact: true })).toBeVisible()
  await expect(page.getByText('Credit Score', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Payout account', { exact: true })).toHaveCount(0)
  await page.getByText('Payments', { exact: true }).click()
  await expect(page.getByText('No payments yet', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Make payment', exact: true })).toHaveCount(0)
  // A deep link or push tap must not open the screen either.
  await page.evaluate(() => { window.history.pushState({}, '', '/loans'); window.dispatchEvent(new PopStateEvent('popstate')) })
  await expect(page.getByText('This service isn’t available', { exact: true })).toBeVisible()
  expect(requests.filter(path => path.startsWith('/api/loans') || path.startsWith('/api/savings') || path.startsWith('/api/credit'))).toEqual([])
})

test('unknown feature status is treated as unavailable, not permission', async ({ page }) => {
  const requests: string[] = []
  await signIn(page, { regulated: { wallet: true } }, requests)
  await expect(page.getByText('RentGuard', { exact: true })).toHaveCount(0)
  await page.evaluate(() => { window.history.pushState({}, '', '/insurance'); window.dispatchEvent(new PopStateEvent('popstate')) })
  await expect(page.getByText('We couldn’t confirm whether this service is available.', { exact: true })).toBeVisible()
})

import { test } from '@playwright/test'
import { checkNotificationPreferences } from '../helpers/notificationPreferences'
const mobileUrl = process.env.MOBILE_WEB_URL
test.skip(!mobileUrl, 'Requires Expo web at MOBILE_WEB_URL')
for (const incomplete of [false, true]) test(`mobile preferences recover from ${incomplete ? 'incomplete' : 'failed'} load and retry a single-field save`, async ({ page }) => {
  const user = { id: '507f1f77bcf86cd799439011', email: 'preferences@rentos.test', firstName: 'Preferences', lastName: 'Fixture', phone: '0241234567', roles: ['tenant'], activeRole: 'tenant', isVerified: true }
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    const data = path === '/api/auth/login' ? { user, token: 'preferences-token', refreshToken: 'preferences-refresh' } : path === '/api/users/me' ? user : path === '/api/chat/unread-count' ? { count: 0 } : { items: [], total: 0 }
    return route.fulfill({ json: { data } })
  })
  await checkNotificationPreferences(page, async () => {
    await page.goto(`${mobileUrl}/auth/login`)
    await page.getByPlaceholder('you@example.com').fill(user.email)
    await page.getByPlaceholder('Enter your password').fill('E2e!Password123')
    await page.getByText('Sign in', { exact: true }).click()
    await page.getByText('Profile', { exact: true }).last().click()
    await page.getByText('Edit Profile', { exact: true }).click()
    await page.getByText('Alerts', { exact: true }).click()
  }, incomplete)
})

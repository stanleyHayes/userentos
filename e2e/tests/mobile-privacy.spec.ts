import { test, expect } from '@playwright/test'
const mobileUrl = process.env.MOBILE_WEB_URL
test.skip(!mobileUrl, 'Requires Expo web at MOBILE_WEB_URL')
test('mobile account closure confirms success after logout redirects to login', async ({ page }) => {
  const user = { id: '507f1f77bcf86cd799439011', email: 'privacy@rentos.test', firstName: 'Privacy', lastName: 'Fixture', phone: '0241234567', roles: ['tenant'], activeRole: 'tenant', isVerified: true }
  let deleted = false
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    let data: unknown = { items: [], total: 0 }
    if (path === '/api/auth/login') data = { user, token: 'privacy-token', refreshToken: 'privacy-refresh' }
    if (path === '/api/users/me') {
      if (route.request().method() === 'DELETE') { deleted = true; data = null }
      else data = user
    }
    if (path === '/api/chat/unread-count') data = { count: 0 }
    await route.fulfill({ json: { success: true, data } })
  })
  await page.goto(`${mobileUrl}/auth/login`)
  await page.getByPlaceholder('you@example.com').fill(user.email)
  await page.getByPlaceholder('Enter your password').fill('E2e!Password123')
  await page.getByText('Sign in', { exact: true }).click()
  await page.getByText('Profile', { exact: true }).last().click()
  await page.getByText('Edit Profile', { exact: true }).click()
  await page.getByText('Privacy, data export and account deletion', { exact: true }).click()
  await page.getByLabel('Type DELETE to confirm account deletion').fill('DELETE')
  await page.getByRole('button', { name: 'Delete my account', exact: true }).click()
  await expect.poll(() => deleted).toBe(true)
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible()
  await expect(page.getByText('Your account is closed', { exact: true })).toBeVisible()
  // Ordinary notifications expire after four seconds; closure needs explicit dismissal.
  await page.waitForTimeout(4500)
  await expect(page.getByText('Your account is closed', { exact: true })).toBeVisible()
})

test('the personal-data export opens as a file download link, not share-sheet text', async ({ page, context }) => {
  const user = { id: '507f1f77bcf86cd799439012', email: 'export@rentos.test', firstName: 'Export', lastName: 'Fixture', phone: '0241234567', roles: ['tenant'], activeRole: 'tenant', isVerified: true }
  const requested: string[] = []
  await context.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    requested.push(`${route.request().method()} ${path}`)
    let data: unknown = { items: [], total: 0 }
    if (path === '/api/auth/login') data = { user, token: 'export-token', refreshToken: 'export-refresh' }
    if (path === '/api/users/me') data = user
    if (path === '/api/chat/unread-count') data = { count: 0 }
    if (path === '/api/users/me/export-link') data = { token: 'download-token' }
    await route.fulfill({ json: { success: true, data } })
  })
  await page.goto(`${mobileUrl}/auth/login`)
  await page.getByPlaceholder('you@example.com').fill(user.email)
  await page.getByPlaceholder('Enter your password').fill('E2e!Password123')
  await page.getByText('Sign in', { exact: true }).click()
  await page.getByText('Profile', { exact: true }).last().click()
  await page.getByText('Edit Profile', { exact: true }).click()
  await page.getByText('Privacy, data export and account deletion', { exact: true }).click()
  // Linking.openURL opens a new tab on web; on a phone, the browser.
  const opened = context.waitForEvent('page')
  await page.getByRole('button', { name: 'Export my personal data', exact: true }).click()
  expect((await opened).url()).toContain('/api/users/me/export.json?token=download-token')
  expect(requested).toContain('POST /api/users/me/export-link')
  expect(requested).not.toContain('GET /api/users/me/export')
  await expect(page.getByText(/downloading in your browser/)).toBeVisible()
})

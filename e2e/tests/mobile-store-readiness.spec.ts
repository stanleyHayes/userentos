import { test, expect, type Page } from '@playwright/test'

const mobileUrl = process.env.MOBILE_WEB_URL
const user = { id: '507f1f77bcf86cd799439061', email: 'store@rentos.test', firstName: 'Store', lastName: 'Fixture', phone: '0241234567', roles: ['tenant'], activeRole: 'tenant', isVerified: true }

test.describe('mounted store-readiness copy', () => {
  test.skip(!mobileUrl, 'Requires Expo web at MOBILE_WEB_URL')

  async function signIn(page: Page, requested: string[] = []) {
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      requested.push(path)
      let data: unknown = { items: [], total: 0 }
      if (path === '/api/auth/login') data = { user, token: 'store-token', refreshToken: 'store-refresh' }
      if (path === '/api/users/me') data = user
      if (path === '/api/chat/unread-count') data = { count: 0 }
      await route.fulfill({ json: { success: true, data } })
    })
    await page.goto(`${mobileUrl}/auth/login`)
    await page.getByPlaceholder('you@example.com').fill(user.email)
    await page.getByPlaceholder('Enter your password').fill('E2e!Password123')
    await page.getByText('Sign in', { exact: true }).click()
    await page.getByText('Profile', { exact: true }).last().click()
  }

  test('account deletion tells store subscribers to cancel billing in their store', async ({ page }) => {
    await signIn(page)
    await page.getByText('Edit Profile', { exact: true }).click()
    await page.getByText('Privacy, data export and account deletion', { exact: true }).click()
    await expect(page.getByText(/Deleting your RentOS account does not cancel a subscription billed by/)).toBeVisible()
    // The web preview lists both stores; each native build names only its own.
    await expect(page.getByRole('link', { name: 'Manage App Store subscriptions' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Manage Google Play subscriptions' })).toBeVisible()
    await page.context().route('https://apps.apple.com/**', route => route.fulfill({ body: 'subscriptions' }))
    const popup = page.waitForEvent('popup')
    await page.getByRole('link', { name: 'Manage App Store subscriptions' }).click()
    await (await popup).waitForURL('https://apps.apple.com/account/subscriptions')
  })

  test('the AI legal assistant shows a persistent not-legal-advice disclaimer', async ({ page }) => {
    await signIn(page)
    await page.getByText('AI Legal Assistant', { exact: true }).click()
    const disclaimer = page.getByTestId('legal-disclaimer')
    await expect(disclaimer).toContainText('General information only, not legal advice')
    await expect(disclaimer).toContainText('consult a lawyer or the Rent Control Department')
  })

  test('the pricing screen no longer exposes model diagnostics', async ({ page }) => {
    const requested: string[] = []
    await signIn(page, requested)
    await page.getByText('Pricing Engine', { exact: true }).click()
    await page.getByText('Estimate', { exact: true }).click()
    await expect(page.getByText('Rent estimate', { exact: true })).toBeVisible()
    await expect(page.getByText(/R²|ML Model Status|Samples:/)).toHaveCount(0)
    expect(requested).not.toContain('/api/pricing/model-status')
  })
})

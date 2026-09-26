import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Config contract, no Expo web needed: the Play "Advertising ID: No" answer
// must be guaranteed by the build, not by whichever SDKs happen to be linked.
// Expo writes tools:node="remove" for every blocked permission. Still confirm
// on the EAS release AAB (`bundletool dump manifest`) before answering.
test('the Android build blocks the advertising-ID permission', () => {
  const appJson = JSON.parse(readFileSync(resolve(__dirname, '../../apps/mobile/app.json'), 'utf8'))
  expect(appJson.expo.android.blockedPermissions).toContain('com.google.android.gms.permission.AD_ID')
})

// Android masks a coloured icon to a solid white square in the status bar;
// the notification icon must be white on transparent.
test('Android notifications use a 96x96 white-on-transparent icon', () => {
  const mobile = resolve(__dirname, '../../apps/mobile')
  const appJson = JSON.parse(readFileSync(resolve(mobile, 'app.json'), 'utf8'))
  const [, options] = appJson.expo.plugins.find((plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-notifications')
  expect(options.icon).toBe('./assets/notification-icon.png')
  const png = readFileSync(resolve(mobile, options.icon))
  expect(png.subarray(1, 4).toString()).toBe('PNG')
  // IHDR: width, height, bit depth 8, colour type 6 (RGBA, so it has transparency).
  expect([png.readUInt32BE(16), png.readUInt32BE(20), png[24], png[25]]).toEqual([96, 96, 8, 6])
})

// google-services.json is never committed; EAS supplies its path as the file
// environment variable GOOGLE_SERVICES_JSON (DEPLOYMENT.md, "Android push").
test('the Android build takes Firebase config from GOOGLE_SERVICES_JSON when set', async () => {
  const mobile = resolve(__dirname, '../../apps/mobile')
  const { default: appConfig } = await import('../../apps/mobile/app.config')
  const appJson = JSON.parse(readFileSync(resolve(mobile, 'app.json'), 'utf8'))
  const context = { config: appJson.expo, projectRoot: mobile, staticConfigPath: resolve(mobile, 'app.json'), packageJsonPath: resolve(mobile, 'package.json') }
  const previous = process.env.GOOGLE_SERVICES_JSON
  try {
    process.env.GOOGLE_SERVICES_JSON = '/eas/build/google-services.json'
    const withFirebase = appConfig(context)
    expect(withFirebase.android?.googleServicesFile).toBe('/eas/build/google-services.json')
    expect(withFirebase.android?.package).toBe('gh.rentos.mobile')
    expect(withFirebase.android?.blockedPermissions).toContain('com.google.android.gms.permission.AD_ID')
    delete process.env.GOOGLE_SERVICES_JSON
    expect(appConfig(context).android?.googleServicesFile).toBeUndefined()
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_SERVICES_JSON
    else process.env.GOOGLE_SERVICES_JSON = previous
  }
})

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

import { test, expect } from '@playwright/test'

const mobileWebUrl = process.env.MOBILE_WEB_URL
test.skip(!mobileWebUrl, 'Set MOBILE_WEB_URL to run the Expo-web auth visual gate')

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 900 },
] as const

for (const viewport of viewports) {
  test(`Expo login shell is complete at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto(`${mobileWebUrl}/auth/login`, { waitUntil: 'networkidle' })
    await expect(page.getByText('Calm before the storm', { exact: true })).toBeHidden({
      timeout: 10_000,
    })

    await expect(page.getByTestId('auth-shell')).toBeVisible()
    await expect(page.getByTestId('auth-hero')).toBeVisible()
    await expect(page.getByTestId('auth-watermarks')).toBeAttached()
    await expect(page.getByTestId('auth-form-card')).toBeVisible()
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible()
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible()
    // React Native Web's TouchableOpacity is exposed as a clickable generic
    // unless an explicit accessibilityRole is supplied.
    await expect(page.getByText('Sign in', { exact: true })).toBeVisible()

    const heroTitle = page.getByText('The keys to your housing world.', { exact: true })
    const fontFamily = await heroTitle.evaluate((element) => getComputedStyle(element).fontFamily)
    const layout = await page.evaluate(() => {
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        outfitLoaded:
          document.fonts.check('16px Outfit_400Regular')
          && document.fonts.check('16px Outfit_800ExtraBold'),
      }
    })
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth)
    expect(fontFamily).toMatch(/Outfit_/)
    expect(layout.outfitLoaded).toBe(true)

    await page.screenshot({
      path: `/tmp/rentos-mobile-auth-${viewport.width}x${viewport.height}.png`,
      fullPage: true,
    })
  })
}

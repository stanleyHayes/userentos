import { test, expect } from '@playwright/test'
import { authRedirect } from '../../apps/mobile/lib/publicRoutes'

const mobileUrl = process.env.MOBILE_WEB_URL

test('signed-out visitors may open only the auth group and deliberate public screens', () => {
  expect(authRedirect(['auth', 'login'], false)).toBeNull()
  expect(authRedirect(['rights-check'], false)).toBeNull()
  for (const segments of [['(tabs)'], ['agreements'], ['property', '[id]'], ['rights-check', 'nested'], ['privacy'], []]) {
    expect(authRedirect(segments, false)).toBe('/auth/login')
  }
  expect(authRedirect(['auth', 'login'], true)).toBe('/(tabs)')
  expect(authRedirect(['rights-check'], true)).toBeNull()
  expect(authRedirect(['agreements'], true)).toBeNull()
})

test.describe('mounted auth guard', () => {
  test.skip(!mobileUrl, 'Requires Expo web at MOBILE_WEB_URL')

  test('the login screen rights check stays reachable without an account', async ({ page }) => {
    const authorized: string[] = []
    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      if (request.headers().authorization) authorized.push(path)
      await route.fulfill({ json: { success: true, data: { items: [], total: 0 } } })
    })
    await page.goto(`${mobileUrl}/auth/login`)
    await page.getByText("Check if it's legal", { exact: true }).click()
    await expect(page.getByText('Is this legal?', { exact: true }).first()).toBeVisible()
    // The guard used to bounce signed-out visitors straight back to login.
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/\/rights-check$/)
    await expect(page.getByText('Check my situation', { exact: true })).toBeVisible()
    expect(authorized).toEqual([])
  })

  test('other screens still require signing in', async ({ page }) => {
    await page.route('**/api/**', route => route.fulfill({ json: { success: true, data: { items: [], total: 0 } } }))
    await page.goto(`${mobileUrl}/agreements`)
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible()
    await expect(page).toHaveURL(/\/auth\/login$/)
  })
})

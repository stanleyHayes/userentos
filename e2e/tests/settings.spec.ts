import { test, expect } from '../fixtures/auth'

/**
 * Tenant navigates to settings and views the profile tab.
 */
test.describe('settings', () => {
  test('tenant can open settings and see profile information', async ({ authedPage: page }) => {
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/settings/)

    // The settings page should show the heading.
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible({ timeout: 15_000 })

    // The profile tab should show the user's email (disabled input).
    await expect(page.getByLabel(/email/i)).toBeVisible()
  })
})

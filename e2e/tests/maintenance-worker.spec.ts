import { test, expect } from '../fixtures/auth'

/**
 * Maintenance and the worker marketplace. Workers is paused for tenants,
 * landlords and agents in Phase 1 (packages/shared/productScope.ts), so the
 * maintenance pages offer no "Find {trade} worker" button that would only
 * bounce them to the dashboard.
 */
test.describe('maintenance while Workers is paused', () => {
  test('a landlord sees no Find worker button on maintenance cards', async ({ authedLandlordPage: page }) => {
    await page.goto('/maintenance')
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15_000 })
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/find .*worker/i)).toHaveCount(0)
  })

  test('a tenant sees no Find worker button on maintenance requests', async ({ authedPage: page }) => {
    await page.goto('/maintenance')
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15_000 })
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/find .*worker/i)).toHaveCount(0)
  })
})

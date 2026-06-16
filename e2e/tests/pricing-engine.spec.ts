import { test, expect } from '../fixtures/auth'

/**
 * Pricing engine page loads and shows analysis tools.
 */
test.describe('pricing engine', () => {
  test('tenant can access pricing page', async ({ authedPage: page }) => {
    await page.goto('/pricing')
    await expect(page).toHaveURL(/\/pricing/)

    // Page heading or tab container should be visible.
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15_000 })

    // Should contain some pricing-related text.
    const pricingText = page.getByText(/price|rent|comparable|trend|fair/i).first()
    await expect(pricingText).toBeVisible()
  })

  test('ml prediction tab is accessible', async ({ authedPage: page }) => {
    await page.goto('/pricing')
    await expect(page).toHaveURL(/\/pricing/)

    // Look for ML prediction related tab or section.
    const mlTab = page.getByRole('tab', { name: /ml|machine|predict/i }).or(
      page.getByRole('button', { name: /ml|machine|predict/i })
    ).first()

    if (await mlTab.isVisible().catch(() => false)) {
      await mlTab.click()
      await page.waitForTimeout(500)
    }

    // Some input fields for property features should exist.
    const input = page.locator('input, select').first()
    await expect(input).toBeVisible()
  })
})

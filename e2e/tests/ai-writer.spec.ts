import { test, expect } from '../fixtures/auth'

/**
 * AI Writing Assistant page loads and tabs are interactive.
 */
test.describe('ai writing assistant', () => {
  test('tenant can access AI writer page and see tabs', async ({ authedPage: page }) => {
    await page.goto('/ai-writer')
    await expect(page).toHaveURL(/\/ai-writer/)

    // Page heading should be visible.
    await expect(page.getByRole('heading', { name: /ai|writing|assistant/i }).first()).toBeVisible({
      timeout: 15_000,
    })

    // At least one tab or section should be visible.
    const tabs = page.getByRole('tab').or(page.getByRole('button'))
    await expect(tabs.first()).toBeVisible()

    // The page should contain text inputs or textareas for generation.
    const input = page.locator('textarea, input[type="text"]').first()
    await expect(input).toBeVisible()
  })

  test('listing generator tab works', async ({ authedPage: page }) => {
    await page.goto('/ai-writer')
    await expect(page).toHaveURL(/\/ai-writer/)

    // Try to find and click a tab related to listing generation.
    const listingTab = page.getByRole('tab', { name: /listing|generate/i }).or(
      page.getByRole('button', { name: /listing|generate/i })
    ).first()

    if (await listingTab.isVisible().catch(() => false)) {
      await listingTab.click()
      await page.waitForTimeout(500)
    }

    // Some form of input for property details should be present.
    const input = page.locator('textarea, input').first()
    await expect(input).toBeVisible()
  })
})

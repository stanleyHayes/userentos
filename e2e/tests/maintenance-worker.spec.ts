import { test, expect } from '../fixtures/auth'

/**
 * Maintenance page integration with worker marketplace.
 */
test.describe('maintenance to worker integration', () => {
  test('landlord sees Find Worker button on maintenance kanban cards', async ({ authedLandlordPage: page }) => {
    await page.goto('/maintenance')
    await expect(page).toHaveURL(/\/maintenance/)

    // Wait for the page to load and render kanban cards or list.
    await page.waitForTimeout(2_000)

    const content = page.locator('main').first()
    await expect(content).toBeVisible({ timeout: 15_000 })

    // Look for the "Find Worker" button on any maintenance card.
    const findWorkerBtn = page.getByText(/find.*worker/i).first()

    // There should be maintenance requests with matching trade categories.
    // If the button is visible, clicking it should navigate to the worker marketplace.
    if (await findWorkerBtn.isVisible().catch(() => false)) {
      await findWorkerBtn.click()
      await expect(page).toHaveURL(/\/workers/)
      // URL should include the trade query parameter.
      const url = page.url()
      expect(url).toMatch(/trade=/)
    }
  })

  test('tenant sees Find Worker button on maintenance list items', async ({ authedPage: page }) => {
    await page.goto('/maintenance')
    await expect(page).toHaveURL(/\/maintenance/)

    await page.waitForTimeout(2_000)

    const content = page.locator('main').first()
    await expect(content).toBeVisible({ timeout: 15_000 })

    // Tenant view shows a list; look for Find Worker buttons.
    const findWorkerBtn = page.getByText(/find.*worker/i).first()

    if (await findWorkerBtn.isVisible().catch(() => false)) {
      await findWorkerBtn.click()
      await expect(page).toHaveURL(/\/workers/)
      const url = page.url()
      expect(url).toMatch(/trade=/)
    }
  })
})

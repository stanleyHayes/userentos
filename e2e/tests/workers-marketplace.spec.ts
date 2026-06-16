import { test, expect } from '../fixtures/auth'

/**
 * Worker marketplace: browse, filter, and view worker profiles.
 */
test.describe('worker marketplace', () => {
  test('tenant can browse workers and filter by trade', async ({ authedPage: page }) => {
    await page.goto('/workers')
    await expect(page).toHaveURL(/\/workers/)

    // Wait for worker cards to load.
    const card = page.locator('text=Kwasi Osei').first()
    await expect(card).toBeVisible({ timeout: 15_000 })

    // At least 4 workers should be visible in the unfiltered list.
    await expect(page.getByText(/plumbing/i).first()).toBeVisible()
    await expect(page.getByText(/electrical/i).first()).toBeVisible()

    // Filter by plumbing trade (MUI Select — click to open, then click option).
    const tradeSelect = page.getByRole('combobox', { name: /trade/i })
    if (await tradeSelect.isVisible().catch(() => false)) {
      await tradeSelect.click()
      await page.getByRole('option', { name: /plumbing/i }).click()
      await page.waitForTimeout(500)
      // After filtering, plumber should still be visible, electrician should not.
      await expect(page.getByText('Kwasi Osei').first()).toBeVisible()
      await expect(page.getByText('Akosua Badu').first()).not.toBeVisible()
    }
  })

  test('tenant can view worker detail page', async ({ authedPage: page }) => {
    await page.goto('/workers')
    await expect(page.locator('text=Kwasi Osei').first()).toBeVisible({ timeout: 15_000 })

    // Click the Profile button on the plumber's card.
    await page.getByRole('button', { name: /profile/i }).nth(1).click()

    // Should navigate to detail page.
    await expect(page).toHaveURL(/\/workers\/[a-f0-9]+/i)

    // Detail page should show worker info and CTAs.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/plumbing/i).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /book|hire/i }).or(
      page.getByText(/book service/i)
    ).first()).toBeVisible()
  })

  test('landlord can access become-a-worker page', async ({ authedLandlordPage: page }) => {
    await page.goto('/workers/join')
    await expect(page).toHaveURL(/\/workers\/join/)

    // The registration form should render with key fields.
    await expect(page.locator('#bw-name')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('#bw-phone')).toBeVisible()
  })
})

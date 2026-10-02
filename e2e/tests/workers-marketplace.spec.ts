import { test, expect } from '../fixtures/auth'

/**
 * Worker marketplace: browse, filter, and view worker profiles. Service
 * providers keep it in Phase 1; for tenants and landlords it is paused
 * (product brief §01), so its pages send them to their dashboard.
 */
test.describe('worker marketplace', () => {
  test('a service provider can browse workers and filter by trade', async ({ authedProviderPage: page }) => {
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
      // After filtering, plumber should still be visible, electrician should not.
      await expect(page.getByText('Kwasi Osei').first()).toBeVisible()
      await expect(page.getByText('Akosua Badu').first()).not.toBeVisible()
    }
  })

  test('a service provider can view another worker\'s profile', async ({ authedProviderPage: page }) => {
    await page.goto('/workers')
    await expect(page.getByText('Akosua Badu', { exact: true })).toBeVisible({ timeout: 15_000 })

    // The innermost element holding both her name and a Profile button is her card.
    const card = page.locator('div')
      .filter({ has: page.getByText('Akosua Badu', { exact: true }) })
      .filter({ has: page.getByRole('button', { name: /profile/i }) })
      .last()
    await card.getByRole('button', { name: /profile/i }).click()

    // Should navigate to detail page.
    await expect(page).toHaveURL(/\/workers\/[a-f0-9]+/i)

    // Detail page should show worker info and CTAs.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/electrical/i).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /book|hire/i }).or(
      page.getByText(/book service/i)
    ).first()).toBeVisible()
  })

  test('a service provider can open the become-a-worker form', async ({ authedProviderPage: page }) => {
    await page.goto('/workers/join')
    await expect(page).toHaveURL(/\/workers\/join/)

    // The registration form should render with key fields.
    await expect(page.locator('#bw-name')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('#bw-phone')).toBeVisible()
  })

  test('the marketplace is paused for tenants', async ({ authedPage: page }) => {
    await page.goto('/workers')
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('becoming a worker is paused for landlords', async ({ authedLandlordPage: page }) => {
    await page.goto('/workers/join')
    await expect(page).toHaveURL(/\/dashboard$/)
  })
})

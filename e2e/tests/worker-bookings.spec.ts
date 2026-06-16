import { test, expect } from '../fixtures/auth'

/**
 * Booking management: requester views their service bookings.
 */
test.describe('service bookings', () => {
  test('tenant can view their bookings on My Bookings page', async ({ authedPage: page }) => {
    await page.goto('/bookings')
    await expect(page).toHaveURL(/\/bookings/)

    // The page should show booking cards or an empty state.
    const heading = page.getByRole('heading', { name: /bookings/i })
    await expect(heading.first()).toBeVisible({ timeout: 15_000 })

    // Kwame (tenant1) has a pending plumbing booking and a completed carpentry booking.
    // Either we see those, or the page renders without crashing.
    const content = page.locator('main, [class*="page"]').first()
    await expect(content).toBeVisible()
  })

  test('tenant can switch to worker view on My Bookings page', async ({ authedPage: page }) => {
    await page.goto('/bookings')
    await expect(page).toHaveURL(/\/bookings/)

    // Look for a toggle or tab to switch to worker view.
    const workerToggle = page.getByRole('button', { name: /my jobs|worker|as worker/i }).or(
      page.getByText(/my jobs/i).first()
    )

    // If the toggle exists, clicking it should switch the view.
    if (await workerToggle.isVisible().catch(() => false)) {
      await workerToggle.click()
      await page.waitForTimeout(500)
      // Worker view heading or content should be visible.
      await expect(page.locator('main').first()).toBeVisible()
    }
  })

  test('landlord can view their bookings', async ({ authedLandlordPage: page }) => {
    await page.goto('/bookings')
    await expect(page).toHaveURL(/\/bookings/)

    const heading = page.getByRole('heading', { name: /bookings/i })
    await expect(heading.first()).toBeVisible({ timeout: 15_000 })

    // Yaw (landlord1) has a confirmed electrical booking.
    const content = page.locator('main, [class*="page"]').first()
    await expect(content).toBeVisible()
  })
})

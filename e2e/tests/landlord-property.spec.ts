import { test, expect } from '../fixtures/auth'

/**
 * Landlord navigates to the add-property page.
 * The seeded landlord (Yaw) is on the Starter plan with a 3-property limit
 * but already has 8 properties, so the page shows a subscription upsell.
 */
test.describe('landlord property management', () => {
  test('landlord sees subscription limit when at property cap', async ({ authedLandlordPage: page }) => {
    await page.goto('/properties/new')
    await expect(page).toHaveURL(/\/properties\/new/)

    // The client shows a splash screen on every mount (~3s).
    await page.waitForTimeout(3_500)

    // The landlord should see the property limit message.
    await expect(page.getByText(/Property Limit Reached/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/Upgrade your subscription/i)).toBeVisible()
  })
})

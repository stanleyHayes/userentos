import { test, expect } from '../fixtures/auth'

/**
 * Landlord logs in and sees the landlord dashboard with property KPIs.
 */
test.describe('landlord dashboard', () => {
  test('landlord can log in and view dashboard', async ({ authedLandlordPage: page }) => {
    // authedLandlordPage already lands on /dashboard after login.
    await expect(page).toHaveURL(/\/dashboard/)

    // The landlord dashboard greets Yaw.
    await expect(page.getByText(/Yaw/).first()).toBeVisible({ timeout: 15_000 })

    // Key landlord KPIs should be visible.
    await expect(page.getByText(/Properties/i).first()).toBeVisible()
    await expect(page.getByText(/Revenue/i).first()).toBeVisible()

    // The "Add Property" button should be visible.
    await expect(page.getByRole('button', { name: /add property/i })).toBeVisible()
  })
})

import { test, expect } from '../fixtures/auth'

/**
 * Tenant lands on the dashboard after login and sees key widgets.
 */
test.describe('tenant dashboard', () => {
  test('dashboard loads and shows tenant greeting', async ({ authedPage: page }) => {
    // authedPage already lands on /dashboard after login.
    await expect(page).toHaveURL(/\/dashboard/)

    // The dashboard greets the tenant by first name.
    await expect(page.getByText(/Good evening, Kwame|Good morning, Kwame|Good afternoon, Kwame/).first()).toBeVisible({ timeout: 15_000 })

    // Key KPI cards should be visible.
    await expect(page.getByText(/Agreements/i).first()).toBeVisible()
    await expect(page.getByText(/Next Payment/i).first()).toBeVisible()
  })
})

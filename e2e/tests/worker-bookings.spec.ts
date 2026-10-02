import { test, expect } from '../fixtures/auth'

/**
 * Service bookings. Service providers keep My Bookings in Phase 1; for tenants
 * and landlords it is paused (product brief §01), so the page sends them to
 * their dashboard.
 */
test.describe('service bookings', () => {
  test('a service provider sees the jobs booked with them', async ({ authedProviderPage: page }) => {
    await page.goto('/bookings')
    await expect(page).toHaveURL(/\/bookings/)
    await expect(page.getByRole('heading', { name: 'My Bookings' })).toBeVisible({ timeout: 15_000 })

    // Kwame (tenant1) booked Kwasi, the seeded plumber, to fix a leaking sink.
    await page.getByRole('button', { name: /My Jobs/ }).click()
    await expect(page.getByText(/Kitchen sink leaking/)).toBeVisible({ timeout: 10_000 })
  })

  test('My Bookings is paused for tenants', async ({ authedPage: page }) => {
    await page.goto('/bookings')
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('My Bookings is paused for landlords', async ({ authedLandlordPage: page }) => {
    await page.goto('/bookings')
    await expect(page).toHaveURL(/\/dashboard$/)
  })
})

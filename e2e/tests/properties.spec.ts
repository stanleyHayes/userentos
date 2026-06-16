import { test, expect } from '../fixtures/auth'

/**
 * Tenant browses the property listings and views a property detail page.
 */
test.describe('property browsing', () => {
  test('tenant can browse properties and view details', async ({ authedPage: page }) => {
    await page.goto('/properties')
    await expect(page).toHaveURL(/\/properties/)

    // Wait for property cards to load.
    const card = page.getByTestId('property-card').first()
    await expect(card).toBeVisible({ timeout: 15_000 })

    // Click the first card and verify navigation to detail page.
    await card.click()
    await expect(page).toHaveURL(/\/properties\/[a-f0-9]+/i)

    // The detail page should show property info (title + contact button).
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: /contact/i })).toBeVisible({ timeout: 10_000 })
  })
})

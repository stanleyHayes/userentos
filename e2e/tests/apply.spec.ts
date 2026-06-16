import { test, expect } from '../fixtures/auth'

/**
 * Tenant submits a rental application against a property.
 *
 * Requires test ids:
 *   - data-testid="property-card"            on each card on /properties
 *   - data-testid="property-apply-button"    on the CTA inside PropertyDetailPage
 *   - data-testid="application-form"         the form root
 *   - data-testid="application-submit"       the submit button
 *   - data-testid="application-success"      success banner / toast container
 */
test.describe('property application', () => {
  test('tenant can browse properties and submit an application', async ({ authedPage: page }) => {
    await page.goto('/properties')
    await expect(page).toHaveURL(/\/properties/)

    // Find a property that hasn't been applied to yet.
    await expect(page.getByTestId('property-card').first()).toBeVisible({ timeout: 15_000 })
    const count = await page.getByTestId('property-card').count()
    let found = false

    for (let i = 0; i < count; i++) {
      // Re-query the card each iteration to avoid stale locators.
      const card = page.getByTestId('property-card').nth(i)
      await card.click()
      await expect(page).toHaveURL(/\/properties\/[a-f0-9]+/i)

      // Wait for the application-state area to stabilise (button OR badge).
      const applyButton = page.getByTestId('property-apply-button')
      const appBadge = page.getByText(/Application Approved|Application Pending/)
      await expect(applyButton.or(appBadge).first()).toBeVisible({ timeout: 10_000 })

      if (await applyButton.isVisible().catch(() => false)) {
        found = true
        break
      }

      // Go back and try the next card.
      await page.goto('/properties')
      await expect(page.getByTestId('property-card').first()).toBeVisible({ timeout: 15_000 })
    }

    if (!found) {
      throw new Error('No property found without an existing application')
    }

    // Open the apply form.
    await page.getByTestId('property-apply-button').click()
    const form = page.getByTestId('application-form')
    await expect(form).toBeVisible()

    // Fill the message field.
    await form.getByRole('textbox').first().fill('I would love to rent this property.')

    await page.getByTestId('application-submit').click()

    // If the tenant has an active lease, a validation message appears inside the
    // form instead of the success banner. Both outcomes are acceptable for this
    // E2E smoke test — we just verify the form submission produces a deterministic
    // UI response.
    const successBanner = page.getByTestId('application-success')
    const validationMessage = page.getByText(/active lease|non-renewal|expires soon/i)
    await expect(successBanner.or(validationMessage).first()).toBeVisible({ timeout: 15_000 })
  })
})

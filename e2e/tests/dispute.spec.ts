import { test, expect } from '../fixtures/auth'

/**
 * Tenant files a dispute.
 *
 * Requires test ids:
 *   - data-testid="new-dispute-button"   CTA on /disputes
 *   - data-testid="dispute-form"         form root
 *   - data-testid="dispute-title"        title field
 *   - data-testid="dispute-description"  description / textarea
 *   - data-testid="dispute-category"     category select
 *   - data-testid="dispute-submit"       submit button
 *   - data-testid="dispute-row"          row in the list view
 */
test.describe('dispute filing', () => {
  test('tenant can file a dispute and see it in the list', async ({ authedPage: page }) => {
    await page.goto('/disputes')
    await expect(page).toHaveURL(/\/disputes/)

    await page.getByTestId('new-dispute-button').click()
    const form = page.getByTestId('dispute-form')
    await expect(form).toBeVisible()

    const uniqueTitle = `E2E dispute ${Date.now()}`
    await page.getByTestId('dispute-title').fill(uniqueTitle)
    await page.getByTestId('dispute-description').fill(
      'Automated end-to-end test — please ignore. Filed to verify the dispute submission flow works in CI.'
    )

    // Category is a select — pick whatever's first.
    await page.getByTestId('dispute-category').click()
    await page.getByRole('option').first().click()

    await page.getByTestId('dispute-submit').click()

    // The newly-created dispute should appear in the list.
    await expect(page.getByText(uniqueTitle).first()).toBeVisible({ timeout: 15_000 })
  })
})

import { test, expect } from '../fixtures/auth'

/**
 * Tenant makes a rent payment. The server runs with
 * `PAYMENTS_PROVIDER_MODE=simulated` by default, so we don't need real MoMo
 * credentials — the simulator auto-completes the payment after ~2s and the
 * UI should reflect a "completed" state without manual webhook triggering.
 *
 * Requires test ids:
 *   - data-testid="make-payment-button"     CTA on /payments
 *   - data-testid="payment-amount-input"    amount field
 *   - data-testid="payment-method-select"   provider picker (MTN/Telecel/...)
 *   - data-testid="payment-submit"          submit/pay button
 *   - data-testid="payment-status"          status pill on each row (e.g. "completed")
 */
test.describe('rent payment', () => {
  test('tenant can submit a rent payment in simulator mode', async ({ authedPage: page }) => {
    await page.goto('/payments')
    await expect(page).toHaveURL(/\/payments/)

    await page.getByTestId('make-payment-button').click()

    await page.getByTestId('payment-amount-input').fill('1500')
    await page.getByTestId('payment-method-select').click()
    await page.getByRole('option', { name: /mtn/i }).click()

    await page.getByTestId('payment-submit').click()

    // Simulator shows instructions modal; dismiss it so the list is visible.
    const gotIt = page.getByRole('button', { name: /got it/i })
    await expect(gotIt).toBeVisible({ timeout: 10_000 })
    await gotIt.click()

    // Simulator auto-completes after ~2s. Refresh to see updated status.
    await page.waitForTimeout(3_000)
    await page.reload()

    await expect(page.getByTestId('payment-status').first()).toHaveText(/completed|success|paid/i, {
      timeout: 20_000,
    })
  })
})

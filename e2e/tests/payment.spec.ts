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

    const mode = await page.evaluate(async () => {
      const token = JSON.parse(localStorage.getItem('rentos-auth')!).state.token
      const response = await fetch('/api/payments/methods', { headers: { Authorization: `Bearer ${token}` } })
      return (await response.json()).data?.mode
    })
    expect(mode).toBe('simulated')

    await page.getByTestId('make-payment-button').click()

    const periodStart = page.getByLabel('Rent period from', { exact: false })
    const startDate = await periodStart.getAttribute('min')
    expect(startDate).toBeTruthy()
    await periodStart.fill(startDate!)
    await page.getByLabel('Rent period through', { exact: false }).fill(startDate!)
    await page.getByTestId('payment-amount-input').fill('1500')
    await page.getByTestId('payment-method-select').click()
    await page.getByRole('option', { name: /mtn/i }).click()

    // Wait for the MUI Select's option list to close before submitting.
    // Without this the submit click lands on the still-closing backdrop and is
    // swallowed: the form stays filled, no request is made, and the failure
    // looks like a missing instructions modal rather than a lost click.
    await expect(page.getByRole('listbox')).toBeHidden()

    const paymentResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/payments' && response.request().method() === 'POST')
    await page.getByTestId('payment-submit').click()
    const initiated = await (await paymentResponse).json()
    const payment = initiated.data.payment
    expect(payment.id).toBeTruthy()

    // Simulator shows instructions modal; dismiss it so the list is visible.
    const gotIt = page.getByRole('button', { name: /got it/i })
    await expect(gotIt).toBeVisible({ timeout: 10_000 })
    await gotIt.click()

    // Simulator auto-completes after ~2s. Refresh to see updated status.
    await page.waitForTimeout(3_000)
    await page.reload()

    const row = page.getByRole('row').filter({ hasText: payment.reference })
    await expect(row.getByTestId('payment-status')).toHaveText(/completed|success|paid/i, {
      timeout: 20_000,
    })
    // Settlement must issue before the user presses the receipt action.
    await expect.poll(() => page.evaluate(async id => {
      const token = JSON.parse(localStorage.getItem('rentos-auth')!).state.token
      const response = await fetch(`/api/payments/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      const saved = (await response.json()).data
      return { receipt: saved?.rentReceipt?.number, creditedAt: saved?.walletCreditCompletedAt }
    }, payment.id)).toMatchObject({ receipt: expect.stringMatching(/^RNT-/), creditedAt: expect.any(String) })
    await row.click()
    await page.route(`**/api/payments/${payment.id}/receipt`, route => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Receipt details are temporarily unavailable.' }) }), { times: 1 })
    await page.getByRole('button', { name: 'View rent receipt', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Receipt details are temporarily unavailable.' })).toBeVisible()
    await expect(page.locator('iframe[title="Rent payment receipt"]')).toHaveCount(0)
    await page.getByRole('button', { name: 'View rent receipt', exact: true }).click()
    const receipt = page.frameLocator('iframe[title="Rent payment receipt"]')
    await expect(receipt.getByRole('heading', { name: 'Rent payment receipt' })).toBeVisible()
    await expect(receipt.getByText(payment.reference, { exact: true })).toBeVisible()
    await page.screenshot({ path: '/tmp/rentos-web-receipt-preview.png', fullPage: true })
    await expect(receipt.getByText('Payment confirmed', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Print or save PDF' })).toBeEnabled()
    // Exercise the browser print control without opening the OS print dialog.
    await page.locator('iframe[title="Rent payment receipt"]').evaluate((element: HTMLIFrameElement) => {
      element.contentWindow!.print = () => { element.dataset.printRequested = 'true' }
    })
    await page.getByRole('button', { name: 'Print or save PDF' }).click()
    await expect(page.locator('iframe[title="Rent payment receipt"]')).toHaveAttribute('data-print-requested', 'true')
    await page.getByRole('button', { name: 'Refresh receipt status' }).click()
    await expect(receipt.getByText(payment.reference, { exact: true })).toBeVisible()
  })
})

test('receipt client discards a copy returned after the account session changes', async ({ authedPage: page }) => {
  await page.route('**/api/payments/session-fixture/receipt', route => route.fulfill({ contentType: 'application/json', body: '{"success":true}' }))
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/payments/session-fixture/receipt.html', async route => {
    await gate
    await route.fulfill({ contentType: 'text/html', body: '<p>Private fixture receipt</p>' })
  })
  const copyRequested = page.waitForRequest('**/api/payments/session-fixture/receipt.html')
  const result = page.evaluate(async () => {
    // Import the actual Vite client module, without copying its implementation.
    const path = '/src/lib/rentReceipt.ts'
    const { fetchRentReceipt } = await import(path)
    try { return { html: await fetchRentReceipt('session-fixture', new AbortController().signal) } }
    catch (failure) { return { error: failure instanceof Error ? failure.message : String(failure) } }
  })
  await copyRequested
  await page.evaluate(async () => {
    const path = '/src/stores/authStore.ts'
    const { useAuthStore } = await import(path)
    useAuthStore.setState({ token: 'different-account-session' })
  })
  release()
  expect(await result).toEqual({ error: 'Account session changed. Please try again.' })
})

test('failed web payment history shows a retry rather than an empty account', async ({ authedPage: page }) => {
  let unavailable = true
  await page.route(url => url.pathname === '/api/payments', route => unavailable
    ? route.fulfill({ status: 503, json: { error: 'Unavailable' } })
    : route.fulfill({ json: { success: true, data: { items: [], total: 0, totalPages: 1, summary: { totalPaid: 0, pendingAmount: 0, pendingCount: 0, failedCount: 0, avgPayment: 0 } } } }))
  await page.goto('/payments')
  await expect(page.getByRole('alert').filter({ hasText: 'Could not load payment history.' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('heading', { name: 'No payments yet', exact: true })).toHaveCount(0)
  unavailable = false
  await page.getByRole('button', { name: 'Retry payment history', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'No payments yet', exact: true })).toBeVisible()
})

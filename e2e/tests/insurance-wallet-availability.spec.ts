import { test, expect } from '../fixtures/auth'

test('insurance checkout distinguishes wallet unavailability from insufficient funds', async ({ authedPage: page }) => {
  let fail = true
  await page.route('**/api/insurance/products*', route => route.fulfill({ json: { data: { items: [{ id: 'fixture-policy', productName: 'Fixture cover', providerName: 'Fixture insurer', category: 'renters', description: 'Test product', monthlyPremium: 10, coverageLimit: 1000, excessAmount: 0, coverages: [], exclusions: [], isActive: true }], total: 1 } } }))
  await page.route('**/api/savings/wallet', route => route.fulfill(fail ? { status: 503, json: { error: 'Unavailable' } } : { json: { data: { balance: 100, transactions: [] } } }))
  await page.goto('/insurance')
  await page.getByRole('button', { name: 'Buy Policy', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Could not load your wallet balance', { timeout: 20_000 })
  await expect(page.getByText('insufficient funds', { exact: false })).toHaveCount(0)
  fail = false
  await page.getByRole('button', { name: 'Retry wallet balance' }).click()
  await expect(page.getByText('Wallet balance:', { exact: false })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

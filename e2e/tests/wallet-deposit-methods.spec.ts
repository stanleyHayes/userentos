import { test, expect } from '../fixtures/auth'

for (const scenario of ['unavailable', 'incomplete']) test(`web wallet ${scenario} response shows an unavailable state and recovers on retry`, async ({ authedPage: page }) => {
  let fail = true
  await page.route('**/api/savings/wallet', route => route.fulfill(fail ? (scenario === 'unavailable' ? { status: 503, json: { error: 'Unavailable' } } : { json: { data: {} } }) : { json: { data: { balance: 100, transactions: [] } } }))
  await page.goto('/savings')
  await expect(page.getByRole('alert')).toContainText('Could not load wallet and savings data.', { timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Deposit', exact: true })).toHaveCount(0)
  fail = false
  await page.getByRole('button', { name: 'Retry wallet and savings' }).click()
  await expect(page.getByRole('button', { name: 'Deposit', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('web deposit uses available rails and preserves the form while retrying method loading', async ({ authedPage: page }) => {
  let fail = true
  await page.route('**/api/payments/methods', route => route.fulfill(fail ? { status: 503, json: { error: 'Unavailable' } } : { json: { data: { methods: [{ id: 'bank_transfer', label: 'Bank Transfer' }] } } }))
  await page.goto('/savings')
  await page.getByRole('button', { name: 'Deposit', exact: true }).click()
  const dialog = page.locator('form').filter({ has: page.locator('#amount') })
  await dialog.getByLabel('Amount (GHS)').fill('10')
  await expect(dialog.getByRole('alert')).toContainText('Could not load payment methods', { timeout: 20_000 })
  await expect(dialog.getByRole('button', { name: 'Deposit', exact: true })).toBeDisabled()
  fail = false
  await dialog.getByRole('button', { name: 'Retry payment methods' }).click()
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await dialog.getByLabel('Method', { exact: true }).click()
  await expect(page.getByRole('option', { name: 'MTN Mobile Money', exact: true })).toHaveCount(0)
  await page.getByRole('option', { name: 'Bank Transfer', exact: true }).click()
  await expect(dialog.getByLabel('Amount (GHS)')).toHaveValue('10')
  await expect(dialog.getByRole('button', { name: 'Deposit', exact: true })).toBeEnabled()
})

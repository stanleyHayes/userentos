import { test, expect } from '../fixtures/auth'

for (const scenario of ['unavailable', 'incomplete']) test(`withdrawal ${scenario} response does not invent missing account status`, async ({ authedPage: page }) => {
  let fail = true
  await page.route('**/api/payouts/available', route => route.fulfill(fail ? (scenario === 'unavailable' ? { status: 503, json: { error: 'Unavailable' } } : { json: { data: {} } }) : { json: { data: { balance: 100, minimum: 10, hasVerifiedAccount: true, payoutInProgress: false } } }))
  await page.goto('/savings')
  await page.getByRole('button', { name: 'Withdraw', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Could not check payout availability', { timeout: 20_000 })
  await expect(page.getByText('Add a payout account before withdrawing', { exact: false })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Request payout', exact: true })).toHaveCount(0)
  fail = false
  await page.getByRole('button', { name: 'Retry payout availability' }).click()
  await expect(page.getByText('Available to withdraw', { exact: true })).toBeVisible()
  await page.getByLabel('Amount (GHS)').fill('10')
  await expect(page.getByRole('button', { name: 'Request payout', exact: true })).toBeEnabled()
})

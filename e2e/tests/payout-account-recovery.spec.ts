import { test, expect } from '../fixtures/auth'

for (const scenario of ['unavailable', 'incomplete']) test(`payout account ${scenario} response does not present an empty setup form`, async ({ authedPage: page }) => {
  let fail = true
  await page.route('**/api/payouts/account', route => route.fulfill(fail ? (scenario === 'unavailable' ? { status: 503, json: { error: 'Unavailable' } } : { json: { data: {} } }) : { json: { data: { type: 'mobile_money', bankCode: 'FIX', bankName: 'Fixture network', accountNumber: '0241234567', accountName: 'Saved owner', verified: true } } }))
  await page.goto('/settings?tab=payouts')
  await expect(page.getByRole('alert')).toContainText('Could not load your payout account', { timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Verify and save', exact: true })).toHaveCount(0)
  fail = false
  await page.getByRole('button', { name: 'Retry payout account' }).click()
  await expect(page.getByText('Saved owner', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Change account' })).toBeVisible()
})

test('payout destination failure can retry and incomplete verification never claims success', async ({ authedPage: page }) => {
  let fail = true
  await page.route('**/api/payouts/account', route => route.fulfill({ json: { data: route.request().method() === 'PUT' ? {} : null } }))
  await page.route('**/api/payouts/destinations', route => route.fulfill(fail ? { status: 503, json: { error: 'Unavailable' } } : { json: { data: { items: [{ type: 'mobile_money', code: 'FIX', name: 'Fixture network' }] } } }))
  await page.goto('/settings?tab=payouts')
  await expect(page.getByRole('button', { name: 'Retry payout destinations' })).toBeVisible({ timeout: 20_000 })
  await page.getByLabel('Mobile money number', { exact: true }).fill('0241234567')
  await page.getByLabel('Account name', { exact: true }).fill('Entered name')
  await expect(page.getByRole('button', { name: 'Verify and save', exact: true })).toBeDisabled()
  fail = false
  await page.getByRole('button', { name: 'Retry payout destinations' }).click()
  await page.getByLabel('Network', { exact: true }).click()
  await page.getByRole('option', { name: 'Fixture network' }).click()
  await page.getByRole('button', { name: 'Verify and save', exact: true }).click()
  await expect(page.getByText('Payout account response is incomplete', { exact: true }).first()).toBeVisible()
  await expect(page.getByLabel('Mobile money number', { exact: true })).toHaveValue('0241234567')
  await expect(page.getByText('Verified as', { exact: false })).toHaveCount(0)
})

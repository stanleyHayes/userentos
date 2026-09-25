import { test, expect } from '../fixtures/auth'
import { noRegulatedFeatures } from '../helpers/regulatedFeatures'

test('web hides unlicensed regulated services and refuses their pages', async ({ authedPage: page }) => {
  const refused: string[] = []
  await page.route('**/api/platform/features', route => route.fulfill({ json: { success: true, data: noRegulatedFeatures } }))
  page.on('request', request => {
    const path = new URL(request.url()).pathname
    if (/^\/api\/(savings|loans|investments|credit|insurance|financing|payouts)\b/.test(path)) refused.push(path)
  })
  await page.goto('/dashboard')
  const nav = page.locator('aside')
  await expect(nav.getByText('Payments', { exact: true }).first()).toBeVisible()
  for (const label of ['RentGuard', 'Financing', 'Credit Score', 'Insurance']) await expect(nav.getByText(label, { exact: true })).toHaveCount(0)
  await page.goto('/savings')
  await expect(page.getByText('This service isn’t available', { exact: true })).toBeVisible()
  await page.goto('/payments')
  await expect(page.getByRole('heading', { name: 'Payments' })).toBeVisible()
  await expect(page.getByTestId('make-payment-button')).toHaveCount(0)
  await page.goto('/settings')
  await expect(page.getByRole('button', { name: /Profile/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Payouts/ })).toHaveCount(0)
  expect(refused).toEqual([])
})

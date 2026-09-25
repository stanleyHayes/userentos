import { test, expect } from '@playwright/test'
import { allRegulatedFeatures, noRegulatedFeatures } from '../helpers/regulatedFeatures'

for (const [label, features, visible] of [['off', noRegulatedFeatures, false], ['on', allRegulatedFeatures, true]] as const) {
  test(`landing page advertises regulated services only when they are ${label}`, async ({ page }) => {
    await page.route('**/api/platform/features', route => route.fulfill({ json: { success: true, data: features } }))
    await page.goto('/')
    await expect(page.getByText('Maintenance and service work', { exact: true })).toBeVisible()
    for (const title of ['RentGuard savings', 'Financing and collections', 'Insurance marketplace', 'Employer payroll mandates', 'Banks and financiers', 'Insurers']) {
      await expect(page.getByText(title, { exact: true })).toHaveCount(visible ? 1 : 0)
    }
  })
}

import { test, expect } from '@playwright/test'
import { renderRentReceipt } from '../../apps/api/src/services/payments/receiptHtml.js'
const receipt = { number: 'RNT-fixture-2026', issuedAt: new Date('2026-09-13T01:00:00Z'), paymentReference: 'PAY-fixture', amount: 1000, currency: 'GHS' as const, paidAt: '2026-09-13T00:50:00Z', periodStart: '2026-09-01', periodEnd: '2026-09-30', tenantName: 'Akosua Ŋutifafa <img src=x onerror=alert(1)>', landlordName: 'Kofi & Ama', propertyTitle: 'Apartment 4', premisesAddress: '10 Independence Avenue, Osu, Accra, Greater Accra, GA-000-0000', furnished: false, contextCapturedAt: new Date('2026-09-12T12:00:00Z') }
for (const width of [390, 1000]) test(`receipt preserves Unicode and safe content at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 })
  await page.setContent(renderRentReceipt(receipt, 'completed', new Date('2026-09-13T02:00:00Z')))
  await expect(page.getByText(receipt.tenantName, { exact: true })).toBeVisible()
  await expect(page.getByText('Unfurnished', { exact: true })).toBeVisible()
  await expect(page.locator('img,script,iframe')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: `/tmp/rentos-receipt-${width}.png`, fullPage: true })
  await page.emulateMedia({ media: 'print' })
  await expect(page.getByText('2026-09-30', { exact: true })).toBeVisible()
})
test('refunded copy prominently preserves original amount and identifies its status time', async ({ page }) => {
  await page.setContent(renderRentReceipt(receipt, 'refunded', new Date('2026-09-13T02:00:00Z')))
  await expect(page.getByRole('status')).toHaveText('Payment refunded — original receipt retained')
  await expect(page.getByText(/Status checked when this copy was generated/)).toBeVisible()
  await expect(page.locator('.amount')).toContainText('1,000.00')
})

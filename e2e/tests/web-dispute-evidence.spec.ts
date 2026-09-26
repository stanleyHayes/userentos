import { test, expect } from '@playwright/test'
import { signInWithMockedApi } from '../helpers/mockedWeb'

// Runs against a Vite dev server with every API response mocked:
//   PLAYWRIGHT_BASE_URL=http://localhost:5602 npx playwright test -c playwright.web-mocked.config.ts
test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'Requires a web dev server at PLAYWRIGHT_BASE_URL')

const tenant = { id: '507f1f77bcf86cd799439301', email: 'ama@rentos.test', firstName: 'Ama', lastName: 'Tenant', phone: '0241234567', roles: ['tenant'], activeRole: 'tenant' }
const disputeId = '507f1f77bcf86cd799439311'
const documentId = '507f1f77bcf86cd799439312'
const dispute = {
  id: disputeId, filedBy: tenant.id, filedAgainst: '507f1f77bcf86cd799439302', propertyId: '507f1f77bcf86cd799439303',
  category: 'maintenance', status: 'filed', title: 'Leak not fixed', description: 'The bathroom pipe has leaked for three weeks.',
  evidence: [{ id: 'ev-1', type: 'image', url: `/api/disputes/${disputeId}/evidence/${documentId}`, documentId, description: 'Leaking pipe', uploadedAt: '2026-09-20T10:00:00.000Z' }],
  createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:00:00.000Z',
}

// Safari and iOS drop a window.open that runs after an await, so the tab must
// open on the click itself, before the download link is fetched, and only
// then be pointed at the file.
test('dispute evidence opens in a tab opened by the click, then pointed at a short-lived link', async ({ page, context }) => {
  await signInWithMockedApi(page, tenant, ({ method, path }) => {
    if (method === 'GET' && path === `/disputes/${disputeId}`) return { data: dispute }
    return undefined
  })
  const popup = page.waitForEvent('popup')
  let tabOpenedBeforeLink = false
  // Registered after the catch-all mock, so it answers this request first.
  await page.route(`**/api/disputes/${disputeId}/evidence/${documentId}/link`, async (route) => {
    tabOpenedBeforeLink = await Promise.race([popup.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3_000))])
    await route.fulfill({ json: { success: true, data: { token: 'download-token' } } })
  })
  await context.route(`**/api/disputes/${disputeId}/evidence/${documentId}?token=*`, (route) => route.fulfill({ contentType: 'text/plain', body: 'evidence file' }))

  await page.goto(`/disputes/${disputeId}`)
  await page.getByRole('button', { name: /Leaking pipe/ }).click({ timeout: 20_000 })

  const tab = await popup
  await expect.poll(() => tab.url()).toContain(`/api/disputes/${disputeId}/evidence/${documentId}?token=download-token`)
  expect(tabOpenedBeforeLink).toBe(true)
})

test('closes the tab it opened when the download link cannot be issued', async ({ page }) => {
  await signInWithMockedApi(page, tenant, ({ method, path }) => {
    if (method === 'GET' && path === `/disputes/${disputeId}`) return { data: dispute }
    if (method === 'POST' && path === `/disputes/${disputeId}/evidence/${documentId}/link`) return { status: 403, error: 'Not authorized to view this dispute' }
    return undefined
  })
  const popup = page.waitForEvent('popup')
  await page.goto(`/disputes/${disputeId}`)
  await page.getByRole('button', { name: /Leaking pipe/ }).click({ timeout: 20_000 })

  const tab = await popup
  await expect.poll(() => tab.isClosed()).toBe(true)
  await expect(page.getByText('Not authorized to view this dispute')).toBeVisible()
})

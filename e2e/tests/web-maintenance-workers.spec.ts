import { test, expect } from '@playwright/test'
import { signInWithMockedApi } from '../helpers/mockedWeb'

// Runs against a Vite dev server with every API response mocked:
//   PLAYWRIGHT_BASE_URL=http://localhost:5602 npx playwright test -c playwright.web-mocked.config.ts
test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'Requires a web dev server at PLAYWRIGHT_BASE_URL')

const request = { id: 'req-1', title: 'Leaking kitchen tap', description: 'Drips all night', category: 'plumbing', priority: 'medium', status: 'requested', propertyId: 'prop-1', propertyTitle: 'Osu flat', createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z' }
const tenant = { id: '507f1f77bcf86cd799439601', email: 'tenant@rentos.test', firstName: 'Ama', lastName: 'Tenant', phone: '0241234567', roles: ['tenant'], activeRole: 'tenant' }
const landlord = { ...tenant, id: '507f1f77bcf86cd799439602', email: 'owner@rentos.test', firstName: 'Yaw', roles: ['landlord'], activeRole: 'landlord' }

// Workers is paused for the active journeys: a "Find plumbing worker" button would only bounce to the dashboard.
for (const user of [tenant, landlord]) {
  test(`a ${user.activeRole} sees the request but no Find worker button while Workers is paused`, async ({ page }) => {
    await signInWithMockedApi(page, user, ({ method, path }) => (method === 'GET' && path === '/maintenance' ? { data: { items: [request], total: 1 } } : undefined))
    await page.goto('/maintenance')
    await expect(page.getByText('Leaking kitchen tap').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/Find .* worker/i)).toHaveCount(0)
  })
}

import { test, expect, type Page } from '@playwright/test'
import { noRegulatedFeatures } from '../helpers/regulatedFeatures'

const mobileUrl = process.env.MOBILE_WEB_URL
test.skip(!mobileUrl, 'Requires Expo web at MOBILE_WEB_URL')

/*
 * Rent collection and the wallet are regulated services, off in production.
 * Without them RentOS records no rent and holds no savings, so GH₵0 revenue,
 * a 0% collection rate and "GH₵0 paid" read as a failing business or a tenant
 * who never pays. These screens show leases and applications instead.
 */
type Answer = Record<string, unknown>
async function signIn(page: Page, role: 'tenant' | 'landlord', answers: Record<string, Answer>) {
  const user = { id: '507f1f77bcf86cd799439021', email: `${role}-money@rentos.test`, firstName: 'Money', lastName: 'Fixture', phone: '0241234567', roles: [role], activeRole: role, isVerified: true }
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    const data = path === '/api/auth/login' ? { user, token: 'money-token', refreshToken: 'money-refresh' }
      : path === '/api/users/me' ? user
        : path === '/api/platform/features' ? noRegulatedFeatures
          : path === '/api/chat/unread-count' ? { count: 0 }
            : answers[path] ?? { items: [], total: 0 }
    return route.fulfill({ json: { success: true, data } })
  })
  await page.goto(`${mobileUrl}/auth/login`)
  await page.getByPlaceholder('you@example.com').fill(user.email)
  await page.getByPlaceholder('Enter your password').fill('E2e!Password123')
  await page.getByText('Sign in', { exact: true }).click()
  await expect(page.getByText('Profile', { exact: true }).last()).toBeVisible()
}

// Screens left behind in the stack stay in the DOM, hidden: look only at what is on screen.
const shown = (page: Page, text: string | RegExp) => page.getByText(text, { exact: typeof text === 'string' }).filter({ visible: true })

async function open(page: Page, path: string) {
  await page.evaluate((to) => { window.history.pushState({}, '', to); window.dispatchEvent(new PopStateEvent('popstate')) }, path)
}

test('a landlord sees applications and leases, not revenue or rent paid, while RentOS collects no rent', async ({ page }) => {
  const agreement = (id: string, status: string) => ({ id, status, rentAmount: 1800, startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z', propertyTitle: `Flat ${id}`, totalPaid: 0, paymentCount: 0 })
  await signIn(page, 'landlord', {
    '/api/analytics/me': { totalProperties: 2, activeTenants: 1, activeAgreements: 1, totalApplications: 4, pendingApplications: 2, openDisputes: 0, totalRevenue: 0, collectionRate: 0, monthlyIncome: {} },
    '/api/agreements/tenants': { items: [{ id: 't1', firstName: 'Ama', lastName: 'Tenant', email: 'ama@rentos.test', isVerified: true, agreements: [agreement('a1', 'active'), agreement('a2', 'expired')] }] },
  })
  await expect(shown(page, 'Applications')).toBeVisible()
  await expect(shown(page, 'Revenue')).toHaveCount(0)

  await open(page, '/analytics')
  await expect(shown(page, 'Applications')).toBeVisible()
  for (const money of ['Revenue', 'Collection', 'Monthly Revenue']) await expect(shown(page, money)).toHaveCount(0)

  await open(page, '/tenants')
  await shown(page, 'Ama Tenant').click()
  // The screen header has its own "Active" tenant count: read the details panel.
  const details = shown(page, 'Tenant Details').locator('xpath=../..')
  await expect(details.getByText('Active', { exact: true })).toBeVisible()
  await expect(details.getByText('Agreements', { exact: true }).first()).toBeVisible()
  await expect(shown(page, 'Total Paid')).toHaveCount(0)
  await expect(shown(page, / paid$/)).toHaveCount(0)
  await expect(shown(page, /^\d+ payments$/)).toHaveCount(0)
})

test('a tenant sees leases and applications, not rent paid or savings, while neither service is offered', async ({ page }) => {
  await signIn(page, 'tenant', {
    '/api/analytics/me': { activeAgreements: 1, totalAgreements: 2, totalApplications: 3, pendingApplications: 1, openDisputes: 0, totalPaid: 0, paymentCount: 0, totalSaved: 0, savingsTarget: 5000, activePlans: 0 },
  })
  await open(page, '/analytics')
  await expect(shown(page, 'Your Activity')).toBeVisible()
  await expect(shown(page, 'Agreements')).toBeVisible()
  for (const money of ['Total Paid', 'Payments', 'Saved', 'Savings Overview', 'Savings Progress']) await expect(shown(page, money)).toHaveCount(0)
})

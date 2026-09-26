import { test, expect, type Locator } from '@playwright/test'
import { signInWithMockedApi } from '../helpers/mockedWeb'

// Runs against a Vite dev server with every API response mocked:
//   PLAYWRIGHT_BASE_URL=http://localhost:5602 npx playwright test -c playwright.web-mocked.config.ts
test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'Requires a web dev server at PLAYWRIGHT_BASE_URL')

const landlord = { id: '507f1f77bcf86cd799439301', email: 'owner@rentos.test', firstName: 'Kojo', lastName: 'Owner', phone: '0241234567', roles: ['landlord'], activeRole: 'landlord' }
const tenant = { ...landlord, id: '507f1f77bcf86cd799439302', email: 'tenant@rentos.test', firstName: 'Ama', roles: ['tenant'], activeRole: 'tenant' }

const paid = (tenantId: string, day: string) => ({ id: `pay-${tenantId}`, tenantId, landlordId: landlord.id, amount: 1500, method: 'mtn_momo', status: 'completed', paidAt: `2026-${day}T09:00:00.000Z`, createdAt: `2026-${day}T09:00:00.000Z` })

async function rightEdge(locator: Locator) {
  const box = await locator.boundingBox()
  return box!.x + box!.width
}

test('the landlord dashboard shows a store-billed plan, a capped collection rate and the newest payments first', async ({ page }) => {
  const requested: string[] = []
  await signInWithMockedApi(page, landlord, ({ method, path }) => {
    if (method !== 'GET') return undefined
    requested.push(path)
    if (path === '/analytics/me') return { data: { totalProperties: 1, activeTenants: 1, activeAgreements: 1, collectionRate: 233, monthlyIncome: {} } }
    if (path === '/subscriptions/my-subscription') {
      return { data: { package: { id: 'pro', name: 'Pro', billingCycle: 'monthly', maxProperties: 10, benefits: [] }, billingSource: 'google_play', propertyCount: 1, maxProperties: 10, canAddProperty: true } }
    }
    // Newest first, as GET /payments returns them.
    if (path === '/payments') return { data: { items: [paid('newest00', '09-20'), paid('middle00', '08-20'), paid('oldest00', '07-20')], total: 3, page: 1, pageSize: 20, totalPages: 1 } }
    return undefined
  })
  await page.goto('/dashboard')

  await expect(page.getByText('Billed via Google Play')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/NaN/)).toHaveCount(0)
  await expect(page.getByText('100% collection rate across active leases.')).toBeVisible()
  const recent = page.getByText('Recent Payments').locator('xpath=../..')
  await expect(recent.getByText(/^Tenant /).first()).toHaveText('Tenant newest00...')
  expect(requested).toContain('/analytics/me')
})

test('the subscription page says how far over the limit a downgraded landlord is, never more than 100%', async ({ page }) => {
  await signInWithMockedApi(page, landlord, ({ method, path }) => {
    if (method === 'GET' && path === '/subscriptions/my-subscription') {
      return { data: { package: { id: 'free', name: 'Starter', price: 0, billingCycle: 'monthly', maxProperties: 3, benefits: [] }, billingSource: 'free', propertyCount: 7, maxProperties: 3, canAddProperty: false } }
    }
    return undefined
  })
  await page.goto('/subscription')
  await expect(page.getByText('Current Plan: Starter')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('4 over limit')).toBeVisible()
  await expect(page.getByText('233%')).toHaveCount(0)
})

test('rental history leaves out rent and landlord when the tenant gave neither', async ({ page }) => {
  await signInWithMockedApi(page, landlord, ({ method, path }) => {
    if (method === 'GET' && path === `/tenant-profile/${tenant.id}`) {
      return { data: { userId: tenant.id, previousRentals: [
        { address: '4 Oxford St', city: 'Accra', duration: '2 years' },
        { address: '9 Liberation Rd', city: 'Accra', duration: '1 year', monthlyRent: 1200, landlordName: 'Yaw Mensah' },
      ] } }
    }
    if (method === 'GET' && path === `/users/${tenant.id}`) return { data: { firstName: 'Ama', lastName: 'Tenant', email: tenant.email } }
    return undefined
  })
  await page.goto(`/tenant-profile/${tenant.id}`)
  await expect(page.getByText('4 Oxford St, Accra')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/Rent: GHS\s*·/)).toHaveCount(0)
  await expect(page.getByText(/Landlord:\s*$/)).toHaveCount(0)
  await expect(page.getByText(/Rent: GH₵\s?1,200 · Landlord: Yaw Mensah/)).toBeVisible()
})

test('a long loan status stays inside its card on a phone', async ({ page }) => {
  // A small phone: beside the title this badge ran 29px past the card edge.
  await page.setViewportSize({ width: 320, height: 740 })
  await signInWithMockedApi(page, tenant, ({ method, path }) => {
    if (method === 'GET' && path === '/loans') {
      return { data: { items: [{ id: 'loan-1', userId: tenant.id, amount: 5000, tenure: 6, interestRate: 24, apr: 30, totalRepayment: 5800, amountPaid: 0, monthlyPayment: 966, status: 'pre_qualified', reason: 'Rent advance' }] } }
    }
    return undefined
  })
  await page.goto('/savings')
  await page.getByRole('button', { name: 'Micro-Loans' }).click({ timeout: 20_000 })
  const badge = page.getByText('Pre-qualified — awaiting lender review')
  await expect(badge).toBeVisible()
  const card = badge.locator('xpath=ancestor::div[contains(concat(" ", @class, " "), " surface-card ")][1]')
  expect(await rightEdge(badge)).toBeLessThanOrEqual(await rightEdge(card))
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})

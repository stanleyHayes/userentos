import { test, expect, type Page, type Request } from '@playwright/test'
import { allRegulatedFeatures } from '../helpers/regulatedFeatures'
const mobileUrl = process.env.MOBILE_WEB_URL
test.skip(!mobileUrl, 'Requires Expo web at MOBILE_WEB_URL')

/*
 * Mobile screens that read or sent a different shape from the API contract
 * the web client already uses. Every response here is what the API actually
 * returns; every request assertion is what the API actually accepts.
 */

const base = { email: 'contracts@rentos.test', firstName: 'Contract', lastName: 'Fixture', phone: '0241234567', isVerified: true }
const tenant = { ...base, id: '507f1f77bcf86cd799439201', roles: ['tenant'], activeRole: 'tenant' }
const government = { ...base, id: '507f1f77bcf86cd799439202', roles: ['government'], activeRole: 'government' }

type Answer = unknown | { status: number; body: unknown }
interface Sent { method: string; path: string; query: URLSearchParams; body: unknown }

/** Sign in through the real login screen with every API call mocked. `answer` returns undefined to fall through to the defaults. */
async function signIn(page: Page, user: typeof tenant, answer: (path: string, request: Request) => Answer = () => undefined) {
  const sent: Sent[] = []
  await page.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    if (request.method() !== 'GET' && path !== '/api/auth/login') sent.push({ method: request.method(), path, query: url.searchParams, body: request.postDataJSON() })
    else if (request.method() === 'GET') sent.push({ method: 'GET', path, query: url.searchParams, body: undefined })
    const custom = answer(path, request)
    if (custom && typeof custom === 'object' && 'status' in custom && 'body' in custom) {
      await route.fulfill({ status: (custom as { status: number }).status, json: (custom as { body: unknown }).body })
      return
    }
    let data: unknown = custom
    if (data === undefined) {
      if (path === '/api/auth/login') data = { user, token: 'contracts-token', refreshToken: 'contracts-refresh' }
      else if (path === '/api/users/me') data = user
      else if (path === '/api/chat/unread-count') data = { count: 0 }
      else if (path === '/api/platform/features') data = allRegulatedFeatures
      else data = { items: [], total: 0 }
    }
    await route.fulfill({ json: { success: true, data } })
  })
  await page.goto(`${mobileUrl}/auth/login`)
  await page.getByPlaceholder('you@example.com').fill(user.email)
  await page.getByPlaceholder('Enter your password').fill('E2e!Password123')
  await page.getByText('Sign in', { exact: true }).click()
  return sent
}

async function openFromProfile(page: Page, menuItem: string) {
  await page.getByText('Profile', { exact: true }).last().click()
  await page.getByText(menuItem, { exact: true }).click()
}

// ── Government ──

test('the Government Panel reads the nested /analytics/platform shape', async ({ page }) => {
  await signIn(page, government, (path) => {
    if (path === '/api/analytics/platform') return {
      users: { total: 4213, verified: 3100, unverified: 1113, byRole: {} },
      properties: { total: 987, regions: { 'Greater Accra': 640, Ashanti: 211 } },
      payments: { total: 50, completedVolume: 1250000 },
      disputes: { total: 40, open: 37 },
      agreements: { total: 10, compliance: { violations: 6, warnings: 19 } },
    }
    if (path === '/api/analytics/housing-demand') return { status: 404, body: { success: false, error: 'Not found' } }
    return undefined
  })
  await openFromProfile(page, 'Government Panel')
  await expect(page.getByText('4213', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('987', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('37', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('6', { exact: true })).toBeVisible()
  await expect(page.getByText('19', { exact: true })).toBeVisible()
  await expect(page.getByText('Greater Accra', { exact: true })).toBeVisible()
  await expect(page.getByText('640', { exact: true })).toBeVisible()
  await expect(page.getByText('No regional data available', { exact: true })).toHaveCount(0)
})

const pending = {
  id: '507f1f77bcf86cd799439211', title: 'Pending Flat in Labone', description: 'Awaiting moderation.', type: 'apartment',
  status: 'available', listingStatus: 'pending_review', address: { street: '2 Labone Cres', city: 'Accra', region: 'Greater Accra' },
  rentAmount: 3000, amenities: [], rules: [], bedrooms: 2, bathrooms: 1, parkingSpaces: 0, furnished: false,
  landlordId: '507f1f77bcf86cd799439212', images: [], createdAt: '2026-09-20T10:00:00.000Z',
}

test('Property Reviews loads the review queue and rejects with a reason code', async ({ page }) => {
  let queue = [pending]
  const sent = await signIn(page, government, (path, request) => {
    // Admin-only; a government reviewer is refused here.
    if (path === '/api/properties/pending-review') return { status: 403, body: { success: false, error: 'Forbidden' } }
    if (path === '/api/properties/review-queue') return { items: queue, total: queue.length }
    if (path === `/api/properties/${pending.id}/review` && request.method() === 'POST') { queue = []; return { id: pending.id, listingStatus: 'rejected' } }
    return undefined
  })
  await openFromProfile(page, 'Property Reviews')
  await expect(page.getByText(pending.title, { exact: true })).toBeVisible()
  await expect(page.getByText('Landlord', { exact: true })).toHaveCount(0)

  await page.getByText('Reject', { exact: true }).click()
  const submit = page.getByRole('button', { name: 'Reject listing' })
  await expect(submit).toBeDisabled()
  await page.getByRole('radio', { name: 'Suspected duplicate listing' }).click()
  await page.getByPlaceholder('Explain what the owner needs to fix...').fill('Same photos as another listing.')
  await submit.click()
  await expect(page.getByText(pending.title, { exact: true })).toHaveCount(0)
  expect(sent.filter(s => s.method === 'POST' && s.path.endsWith('/review')).map(s => s.body)).toEqual([
    { action: 'reject', reasonCode: 'suspected_duplicate', note: 'Same photos as another listing.' },
  ])
})

test('Property Reviews shows a queue that failed to load instead of "All caught up"', async ({ page }) => {
  await signIn(page, government, (path) => {
    if (path === '/api/properties/review-queue') return { status: 403, body: { success: false, error: 'You do not have permission to review properties' } }
    return undefined
  })
  await openFromProfile(page, 'Property Reviews')
  await expect(page.getByText("Couldn't load reviews", { exact: true })).toBeVisible()
  await expect(page.getByText('All caught up!', { exact: true })).toHaveCount(0)
})

test('rejecting from the property screen sends a reason code', async ({ page }) => {
  const sent = await signIn(page, government, (path, request) => {
    if (path === '/api/properties' && request.method() === 'GET') return { items: [pending], total: 1 }
    if (path === `/api/properties/${pending.id}`) return pending
    if (path === `/api/properties/${pending.id}/review`) return { id: pending.id, listingStatus: 'rejected' }
    return undefined
  })
  await page.getByText('Properties', { exact: true }).last().click()
  await page.getByText(pending.title, { exact: true }).first().click()
  await page.getByText('Reject Listing', { exact: true }).click()
  const submit = page.getByRole('button', { name: 'Reject listing' })
  await expect(submit).toBeDisabled()
  // "Other" needs an explanation before it can be sent.
  await page.getByRole('radio', { name: 'Other (explain below)' }).click()
  await expect(submit).toBeDisabled()
  await page.getByPlaceholder('Explain what the owner needs to fix...').fill('Rent advance exceeds six months.')
  await submit.click()
  await expect.poll(() => sent.find(s => s.path === `/api/properties/${pending.id}/review`)?.body).toEqual({
    action: 'reject', reasonCode: 'other', note: 'Rent advance exceeds six months.',
  })
})

// ── Tenant ──

test("a tenant sees the listing requirements they don't meet", async ({ page }) => {
  const listing = { ...pending, listingStatus: 'approved', title: 'No-Smoking Flat in Osu' }
  await signIn(page, tenant, (path, request) => {
    if (path === '/api/properties' && request.method() === 'GET') return { items: [listing], total: 1 }
    if (path === `/api/properties/${listing.id}/qualify`) return { qualified: false, issues: ['Property does not allow smokers'], propertyId: listing.id }
    if (path === `/api/properties/${listing.id}`) return listing
    return undefined
  })
  await page.getByText('Properties', { exact: true }).last().click()
  await page.getByText(listing.title, { exact: true }).first().click()
  await expect(page.getByText('Property does not allow smokers', { exact: true })).toBeVisible()
  await expect(page.getByText('1 requirement not met', { exact: true })).toBeVisible()
})

test("the 'Currently Residing' banner opens the tenant's agreements", async ({ page }) => {
  const agreement = { id: 'agreement-1', propertyId: pending.id, status: 'active', rentAmount: 1500, startDate: '2026-01-01', endDate: '2026-12-31', landlordId: pending.landlordId, tenantId: tenant.id }
  await signIn(page, tenant, (path) => (path === '/api/agreements' ? { items: [agreement], total: 1 } : undefined))
  await page.getByText('Currently Residing', { exact: true }).click()
  await expect(page).toHaveURL(/\/agreements$/)
  await expect(page.getByText(/Page not found/)).toHaveCount(0)
})

test('notifications keep the read state the API returns', async ({ page }) => {
  const sent = await signIn(page, tenant, (path) => {
    if (path === '/api/notifications') return {
      items: [
        { id: 'n-read', title: 'Rent received', message: 'Your landlord confirmed payment.', type: 'payment', read: true, createdAt: '2026-09-20T10:00:00.000Z' },
        { id: 'n-new', title: 'Viewing booked', message: 'Saturday at 10am.', type: 'property', read: false, createdAt: '2026-09-21T10:00:00.000Z' },
      ],
      total: 2,
    }
    return undefined
  })
  await openFromProfile(page, 'Notifications')
  await expect(page.getByText('1 unread', { exact: true })).toBeVisible()
  await page.getByText('Rent received', { exact: true }).click()
  await page.getByText('Viewing booked', { exact: true }).click()
  await expect(page.getByText('1 unread', { exact: true })).toHaveCount(0)
  expect(sent.filter(s => s.method === 'PATCH').map(s => s.path)).toEqual(['/api/notifications/n-new/read'])
})

test("documents show the file size and offer the owner's delete control", async ({ page }) => {
  await signIn(page, tenant, (path) => {
    if (path === '/api/documents') return {
      items: [
        { id: 'doc-mine', ownerId: tenant.id, name: 'Lease.pdf', type: 'rental_agreement', mimeType: 'application/pdf', fileUrl: 'https://files.test/lease.pdf', fileSize: 1572864, createdAt: '2026-09-01T10:00:00.000Z' },
        { id: 'doc-shared', ownerId: '507f1f77bcf86cd799439299', name: 'Receipt.png', type: 'receipt', mimeType: 'image/png', fileUrl: 'https://files.test/receipt.png', fileSize: 2048, createdAt: '2026-09-02T10:00:00.000Z' },
      ],
      total: 2,
    }
    return undefined
  })
  await openFromProfile(page, 'Documents')
  await expect(page.getByText('1.5 MB', { exact: true })).toBeVisible()
  await expect(page.getByText('2.0 KB', { exact: true })).toBeVisible()
  await expect(page.getByText(/NaN/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Delete Lease.pdf' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete Receipt.png' })).toHaveCount(0)
})

test('Pricing Analysis leaves out an empty floor area and an unticked Furnished', async ({ page }) => {
  const sent = await signIn(page, tenant, (path, request) => {
    if (path === '/api/pricing/comparables') {
      const q = new URL(request.url()).searchParams
      // What the API does: '' fails floorArea's positive() check.
      if (q.get('floorArea') === '') return { status: 400, body: { success: false, error: 'Too small: expected number to be >0' } }
      return { suggestedRent: 2600, marketMedian: 2500, marketAverage: 2550, marketMin: 2000, marketMax: 3100, comparableCount: 8, confidence: 'medium', factors: [], comparableProperties: [] }
    }
    return undefined
  })
  await openFromProfile(page, 'Pricing Engine')
  await expect(page.getByText('GHS 2500', { exact: true })).toBeVisible()
  const first = sent.find(s => s.path === '/api/pricing/comparables')!
  expect(first.query.has('floorArea')).toBe(false)
  expect(first.query.has('furnished')).toBe(false)

  await page.getByText('Furnished', { exact: true }).click()
  await expect.poll(() => sent.filter(s => s.path === '/api/pricing/comparables').at(-1)?.query.get('furnished')).toBe('true')
})

// ── Workers ──

const worker = {
  id: '507f1f77bcf86cd799439221', userId: '507f1f77bcf86cd799439222', name: 'Efua Fixer', trades: ['plumbing'], skills: ['leaks'], bio: 'Pipes and taps.',
  location: 'Accra', serviceRadiusKm: 15, fixedRates: [{ service: 'pipe_repair', price: 150 }], rating: 4.2, reviewCount: 5, completedJobs: 9,
  verificationLevel: 'basic', emergencyAvailable: false, approvalStatus: 'approved', portfolio: [],
  availability: { monday: ['09:00-12:00'], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] },
}

test('a worker with fixed rates and no hourly rate renders, and books with a valid service type', async ({ page }) => {
  const sent = await signIn(page, tenant, (path, request) => {
    if (path === '/api/workers') return { items: [worker], total: 1 }
    if (path === `/api/workers/${worker.id}`) return worker
    if (path === '/api/service-bookings' && request.method() === 'POST') return { status: 201, body: { success: true, data: { id: 'booking-1' } } }
    return undefined
  })
  await openFromProfile(page, 'Find Workers')
  await page.getByText(worker.name, { exact: true }).first().click()
  await expect(page.getByText('Pipe Repair', { exact: true })).toBeVisible()
  await expect(page.getByText('GHS 150', { exact: true })).toBeVisible()
  await expect(page.getByText('Quote on request', { exact: true }).last()).toBeVisible()
  await expect(page.getByText('Mon · Accra (15km radius)', { exact: true })).toBeVisible()
  await expect(page.getByText(/undefined/)).toHaveCount(0)

  await page.getByText('Book Service', { exact: true }).click()
  await page.getByRole('radio', { name: 'Repair' }).click()
  await page.getByPlaceholder('Describe the work needed...').fill('Kitchen tap leaks all night.')
  await page.getByText('Send Booking Request', { exact: true }).click()
  await expect.poll(() => sent.find(s => s.method === 'POST' && s.path === '/api/service-bookings')?.body).toMatchObject({
    workerId: worker.id, type: 'repair', description: 'Kitchen tap leaks all night.', recurrence: 'none',
  })
})

test('Become a Worker sends only the fields POST /workers accepts', async ({ page }) => {
  const sent = await signIn(page, tenant, (path, request) => {
    if (path === '/api/workers' && request.method() === 'POST') return { status: 201, body: { success: true, data: { id: 'worker-new' } } }
    return undefined
  })
  await openFromProfile(page, 'Become a Worker')
  await page.getByPlaceholder('Kwasi Osei').fill('Kofi Mensah')
  await page.getByPlaceholder('0244441111').fill('0244441111')
  await page.getByText('Plumbing', { exact: true }).click()
  await page.getByPlaceholder('Accra', { exact: true }).fill('Tema')
  await page.getByPlaceholder('15', { exact: true }).fill('20')
  await page.getByText('Create Worker Profile', { exact: true }).click()
  await expect.poll(() => sent.find(s => s.method === 'POST' && s.path === '/api/workers')?.body).toEqual({
    name: 'Kofi Mensah', phone: '0244441111', trades: ['plumbing'], skills: [], bio: '', location: 'Tema', serviceRadiusKm: 20,
  })
})

import { test, expect, type Page, type Request } from '@playwright/test'
import { allRegulatedFeatures } from '../helpers/regulatedFeatures'
const mobileUrl = process.env.MOBILE_WEB_URL
test.skip(!mobileUrl, 'Requires Expo web at MOBILE_WEB_URL')

const tenant = { id: '507f1f77bcf86cd799439041', email: 'reports@rentos.test', firstName: 'Report', lastName: 'Fixture', phone: '0241234567', roles: ['tenant'], activeRole: 'tenant', isVerified: true }
const landlord = { ...tenant, id: '507f1f77bcf86cd799439042', email: 'owner@rentos.test', roles: ['landlord'], activeRole: 'landlord' }
const propertyId = '507f1f77bcf86cd799439031'
const property = {
  id: propertyId, title: 'Fixture Flat in Osu', description: 'Two bedrooms close to Oxford Street.', type: 'apartment',
  status: 'available', listingStatus: 'approved', address: { street: '1 Oxford St', city: 'Accra', region: 'Greater Accra' },
  rentAmount: 2500, amenities: ['Water'], rules: [], bedrooms: 2, bathrooms: 1, parkingSpaces: 0, furnished: false,
  landlordId: landlord.id, images: [],
}
const reviews = [
  { id: 'review-other', userId: '507f1f77bcf86cd799439043', rating: 2, content: 'The landlord never fixed the leaking roof.', createdAt: '2026-08-01T10:00:00.000Z' },
  { id: 'review-mine', userId: tenant.id, rating: 5, content: 'My own review of this flat.', createdAt: '2026-08-02T10:00:00.000Z' },
]

async function openProperty(page: Page, user: typeof tenant) {
  const posts: { path: string; body: Record<string, unknown> }[] = []
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === 'POST' && path !== '/api/auth/login') posts.push({ path, body: request.postDataJSON() })
    let data: unknown = { items: [], total: 0 }
    if (path === '/api/auth/login') data = { user, token: 'reports-token', refreshToken: 'reports-refresh' }
    else if (path === '/api/users/me') data = user
    else if (path === '/api/chat/unread-count') data = { count: 0 }
    else if (path === '/api/properties' && request.method() === 'GET') data = { items: [property], total: 1 }
    else if (path === `/api/properties/${propertyId}/qualify`) data = { qualified: true, checks: [], passedCount: 0, totalCount: 0 }
    else if (path === `/api/properties/${propertyId}`) data = property
    else if (path === `/api/reviews/property/${propertyId}`) data = { reviews, page: 1, pageSize: 10, totalPages: 1 }
    else if (path === '/api/reports') { await route.fulfill({ status: 201, json: { success: true, data: { id: 'report-1', status: 'open' } } }); return }
    else if (path === '/api/reviews' && request.method() === 'POST') { await route.fulfill({ status: 201, json: { success: true, data: { id: 'review-new' } } }); return }
    await route.fulfill({ json: { success: true, data } })
  })
  await page.goto(`${mobileUrl}/auth/login`)
  await page.getByPlaceholder('you@example.com').fill(user.email)
  await page.getByPlaceholder('Enter your password').fill('E2e!Password123')
  await page.getByText('Sign in', { exact: true }).click()
  await page.getByText('Properties', { exact: true }).last().click()
  await page.getByText(property.title, { exact: true }).first().click()
  await expect(page.getByText('Reviews (2)', { exact: true })).toBeVisible()
  return posts
}

test('a listing and a review can each be reported with a reason and a confirmation', async ({ page }) => {
  const posts = await openProperty(page, tenant)

  // Reviews render their body (the API field is `content`).
  await expect(page.getByText(reviews[0].content, { exact: true })).toBeVisible()
  // Your own review offers no report control.
  await expect(page.getByRole('button', { name: 'Report review' })).toHaveCount(1)

  await page.getByRole('button', { name: 'Report listing' }).click()
  await expect(page.getByText('Report listing', { exact: true }).last()).toBeVisible()
  const submit = page.getByRole('button', { name: 'Submit report' })
  await expect(submit).toBeDisabled()
  await page.getByRole('radio', { name: 'Scam or fraud' }).click()
  await page.getByLabel('Report details').fill('Asked for a deposit before any viewing.')
  await submit.click()
  await expect(page.getByText('Report sent', { exact: true })).toBeVisible()
  expect(posts.filter(p => p.path === '/api/reports').map(p => p.body)).toEqual([
    { targetType: 'property', targetId: propertyId, reason: 'scam_or_fraud', details: 'Asked for a deposit before any viewing.' },
  ])
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText('Report sent', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Report review' }).click()
  await page.getByRole('radio', { name: 'Offensive, abusive or hateful' }).click()
  await page.getByRole('button', { name: 'Submit report' }).click()
  await expect(page.getByText('Report sent', { exact: true })).toBeVisible()
  expect(posts.filter(p => p.path === '/api/reports').at(-1)?.body).toEqual({ targetType: 'review', targetId: 'review-other', reason: 'offensive_content' })
})

test('"Something else" needs a description before the report can be sent', async ({ page }) => {
  await openProperty(page, tenant)
  await page.getByRole('button', { name: 'Report listing' }).click()
  await page.getByRole('radio', { name: 'Something else' }).click()
  const submit = page.getByRole('button', { name: 'Submit report' })
  await expect(submit).toBeDisabled()
  await page.getByLabel('Report details').fill('The photos are of a different building.')
  await expect(submit).toBeEnabled()
})

test('a tenant review is submitted with the title the API requires', async ({ page }) => {
  const posts = await openProperty(page, tenant)
  await page.getByText('Write a Review', { exact: true }).click()
  await page.getByRole('button', { name: 'Rate 4 stars' }).click()
  await page.getByPlaceholder('Share your experience...').fill('Quiet street and reliable water. The landlord answers quickly.')
  await page.getByText('Submit Review', { exact: true }).click()
  await expect.poll(() => posts.find(p => p.path === '/api/reviews')?.body).toMatchObject({
    propertyId, rating: 4, title: 'Quiet street and reliable water.', content: 'Quiet street and reliable water. The landlord answers quickly.',
  })
})

test('the owner sees no dead Edit control and cannot report their own listing', async ({ page }) => {
  await openProperty(page, landlord)
  await expect(page.getByText('Edit Property', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Report listing' })).toHaveCount(0)
})

/** Sign in through the real login screen with every API call mocked, then open a Profile menu entry. */
async function openFromProfile(page: Page, user: typeof tenant, menuItem: string, answer: (path: string, request: Request) => unknown) {
  const reports: Record<string, unknown>[] = []
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/reports') { reports.push(request.postDataJSON()); await route.fulfill({ status: 201, json: { success: true, data: { id: `report-${reports.length}`, status: 'open' } } }); return }
    let data: unknown = answer(path, request)
    if (data === undefined) {
      if (path === '/api/auth/login') data = { user, token: 'reports-token', refreshToken: 'reports-refresh' }
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
  await page.getByText('Profile', { exact: true }).last().click()
  await page.getByText(menuItem, { exact: true }).click()
  return reports
}

async function submitReport(page: Page, reason: string) {
  await page.getByRole('radio', { name: reason }).click()
  await page.getByRole('button', { name: 'Submit report' }).click()
  await expect(page.getByText('Report sent', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText('Report sent', { exact: true })).toHaveCount(0)
}

const business = { id: '507f1f77bcf86cd799439051', ownerId: '507f1f77bcf86cd799439052', name: 'Fixture Movers', category: 'moving', phone: '0240000000', city: 'Accra', isVerified: true, reviewCount: 2, ratingAvg: 3, createdAt: '2026-08-01T10:00:00.000Z' }
const businessReviews = [
  { id: 'business-review-1', businessId: business.id, authorId: '507f1f77bcf86cd799439053', authorName: 'Kofi', rating: 1, review: 'Insulting language from the crew.', createdAt: '2026-08-03T10:00:00.000Z' },
  { id: 'business-review-2', businessId: business.id, authorId: tenant.id, authorName: 'Report Fixture', rating: 5, review: 'My own review of the movers.', createdAt: '2026-08-04T10:00:00.000Z' },
]

test('a local-services business and business review are reported with their own target types', async ({ page }) => {
  const reports = await openFromProfile(page, tenant, 'Local Services', (path) => {
    if (path === '/api/businesses') return { items: [{ business, listings: [] }] }
    if (path === `/api/businesses/${business.id}/reviews`) return { items: businessReviews, canReview: false }
    return undefined
  })
  await page.getByText(business.name, { exact: true }).first().click()
  await expect(page.getByText(businessReviews[0].review, { exact: true })).toBeVisible()
  // The admin-approval flag is described as a review, not a verification.
  await expect(page.getByText('Reviewed by RentOS', { exact: true })).toBeVisible()
  // Your own review offers no report control.
  await expect(page.getByRole('button', { name: 'Report review' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Report review' }).click()
  await submitReport(page, 'Offensive, abusive or hateful')
  await page.getByRole('button', { name: 'Report business' }).click()
  await submitReport(page, 'Scam or fraud')
  expect(reports).toEqual([
    { targetType: 'business_review', targetId: businessReviews[0].id, reason: 'offensive_content' },
    { targetType: 'business', targetId: business.id, reason: 'scam_or_fraud' },
  ])
})

test('a worker reports an abusive review on their job as a worker_review keyed by the booking', async ({ page }) => {
  const booking = {
    id: '507f1f77bcf86cd799439055', type: 'plumbing', description: 'Fix the kitchen tap', status: 'completed', paymentStatus: 'paid',
    quoteAmount: 200, quoteAccepted: true, rating: 1, review: 'Useless and rude.', notes: [], requesterId: tenant.id, createdAt: '2026-08-05T10:00:00.000Z',
  }
  const reports = await openFromProfile(page, landlord, 'My Bookings', (path, request) => {
    if (path === '/api/service-bookings') return { items: new URL(request.url()).searchParams.get('asWorker') === 'true' ? [booking] : [] }
    return undefined
  })
  await page.getByText('My Jobs', { exact: true }).click()
  await expect(page.getByText(`"${booking.review}"`, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Report review' }).click()
  await submitReport(page, 'Offensive, abusive or hateful')
  expect(reports).toEqual([{ targetType: 'worker_review', targetId: booking.id, reason: 'offensive_content' }])
})

const worker = {
  id: '507f1f77bcf86cd799439056', userId: '507f1f77bcf86cd799439057', name: 'Yaw Plumber', trades: ['plumbing'], skills: ['leaks'], bio: 'Twenty years of pipes.',
  location: 'Accra', serviceRadius: 10, hourlyRate: 80, fixedRates: {}, rating: 4.5, reviewCount: 3, completedJobs: 12, verificationLevel: 'basic',
  emergencyAvailable: false, yearsExperience: 20, availability: { monday: true },
}
const workerApi = (path: string) => {
  if (path === '/api/workers') return { items: [worker] }
  if (path === `/api/workers/${worker.id}`) return worker
  return undefined
}

test('a worker profile can be reported by someone else', async ({ page }) => {
  const reports = await openFromProfile(page, tenant, 'Find Workers', workerApi)
  await page.getByText(worker.name, { exact: true }).first().click()
  await expect(page.getByText(worker.bio, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Report worker' }).click()
  await expect(page.getByText('Report worker', { exact: true }).last()).toBeVisible()
  await submitReport(page, 'False or misleading')
  expect(reports).toEqual([{ targetType: 'worker', targetId: worker.id, reason: 'misleading_listing' }])
})

test('a worker sees no report control on their own profile', async ({ page }) => {
  await openFromProfile(page, { ...tenant, id: worker.userId }, 'Find Workers', workerApi)
  await page.getByText(worker.name, { exact: true }).first().click()
  await expect(page.getByText(worker.bio, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Report worker' })).toHaveCount(0)
})

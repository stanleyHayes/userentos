import { test, expect, type Page } from '@playwright/test'
import { signInWithMockedApi, type MockHandler } from '../helpers/mockedWeb'

// Runs against a Vite dev server with every API response mocked:
//   PLAYWRIGHT_BASE_URL=http://localhost:5602 npx playwright test -c playwright.web-mocked.config.ts
test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'Requires a web dev server at PLAYWRIGHT_BASE_URL')

const tenant = { id: '507f1f77bcf86cd799439061', email: 'reporter@rentos.test', firstName: 'Ama', lastName: 'Reporter', phone: '0241234567', roles: ['tenant'], activeRole: 'tenant' }
const landlord = { ...tenant, id: '507f1f77bcf86cd799439062', email: 'owner@rentos.test', firstName: 'Kojo', roles: ['landlord'], activeRole: 'landlord' }

type Report = { targetType: string; targetId: string; reason: string; details?: string }

function reportsApi(reports: Report[], handle: MockHandler, reject?: (body: Report) => { status: number; error: string } | undefined): MockHandler {
  return (request) => {
    if (request.method === 'POST' && request.path === '/reports') {
      const body = request.body as Report
      const refusal = reject?.(body)
      if (refusal) return refusal
      reports.push(body)
      return { status: 201, data: { id: `report-${reports.length}`, status: 'open' } }
    }
    return handle(request)
  }
}

async function fileReport(page: Page, dialogName: string, reason: string, details?: string) {
  const dialog = page.getByRole('dialog', { name: dialogName })
  await expect(dialog).toBeVisible()
  const submit = dialog.getByRole('button', { name: 'Submit report' })
  await expect(submit).toBeDisabled()
  await dialog.getByRole('radio', { name: reason }).check()
  if (details) await dialog.getByLabel(/Details/).fill(details)
  await submit.click()
  return dialog
}

async function expectSent(page: Page) {
  const sent = page.getByRole('dialog', { name: 'Report sent' })
  await expect(sent.getByRole('status')).toContainText('Our moderation team will review this')
  await sent.getByRole('button', { name: 'Done' }).click()
  await expect(sent).toHaveCount(0)
}

const propertyId = '507f1f77bcf86cd799439071'
function propertyApi(landlordVerified: boolean): MockHandler {
  const property = {
    id: propertyId, _id: propertyId, title: 'Fixture Flat in Osu', description: 'Two bedrooms close to Oxford Street.', type: 'apartment',
    status: 'available', listingStatus: 'approved', address: { street: '1 Oxford St', city: 'Accra', region: 'Greater Accra' },
    rentAmount: 2500, advanceMonths: 6, rentDurationMonths: 12, amenities: [], rules: [], images: [], bedrooms: 2, bathrooms: 1,
    landlordId: landlord.id, landlordName: 'Kojo Owner', landlordVerified, views: 3, favorites: 1, inquiries: 0,
  }
  const reviews = [
    { id: 'review-other', propertyId, userId: '507f1f77bcf86cd799439063', userName: 'Esi', rating: 2, title: 'Leaky roof', content: 'The landlord never fixed the leaking roof.', pros: [], cons: [], verified: true, createdAt: '2026-08-01T10:00:00.000Z', updatedAt: '2026-08-01T10:00:00.000Z' },
    { id: 'review-mine', propertyId, userId: tenant.id, userName: 'Ama', rating: 5, title: 'Mine', content: 'My own review of this flat.', pros: [], cons: [], verified: true, createdAt: '2026-08-02T10:00:00.000Z', updatedAt: '2026-08-02T10:00:00.000Z' },
  ]
  return ({ path }) => {
    if (path === `/properties/${propertyId}`) return { data: property }
    if (path === `/properties/${propertyId}/qualify`) return { data: { qualified: true, issues: [], propertyId } }
    if (path === `/reviews/property/${propertyId}`) return { data: { reviews, summary: { count: 2, avgRating: 3.5 } } }
    if (path.startsWith('/reviews/neighborhood/')) return { status: 404, error: 'No data' }
    return undefined
  }
}

test('a listing and a property review are reported with a reason, details and a confirmation', async ({ page }) => {
  const reports: Report[] = []
  await signInWithMockedApi(page, tenant, reportsApi(reports, propertyApi(false)))
  await page.goto(`/properties/${propertyId}`)
  await expect(page.getByRole('heading', { name: 'Fixture Flat in Osu' })).toBeVisible()
  // No identity review on file: no trust label at all.
  await expect(page.getByText('ID reviewed by RentOS')).toHaveCount(0)
  await expect(page.getByText('Verified landlord')).toHaveCount(0)

  await page.getByRole('button', { name: 'Report listing' }).click()
  await fileReport(page, 'Report listing', 'Scam or fraud', 'Asked for a deposit before any viewing.')
  await expectSent(page)
  expect(reports).toEqual([{ targetType: 'property', targetId: propertyId, reason: 'scam_or_fraud', details: 'Asked for a deposit before any viewing.' }])

  await page.getByRole('button', { name: /Reviews \(2\)/ }).click()
  await expect(page.getByText('The landlord never fixed the leaking roof.')).toBeVisible()
  // Your own review has no report control.
  await expect(page.getByRole('button', { name: 'Report review' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Report review' }).click()
  await fileReport(page, 'Report review', 'Offensive, abusive or hateful')
  await expectSent(page)
  expect(reports.at(-1)).toEqual({ targetType: 'review', targetId: 'review-other', reason: 'offensive_content' })
})

test('the landlord sees the ID-review label and cannot report their own listing', async ({ page }) => {
  await signInWithMockedApi(page, landlord, propertyApi(true))
  await page.goto(`/properties/${propertyId}`)
  await expect(page.getByRole('heading', { name: 'Fixture Flat in Osu' })).toBeVisible()
  // Backed by an approved identity review; worded like the tenant passport.
  await expect(page.getByText('Listed by Kojo Owner · ID reviewed by RentOS')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Report listing' })).toHaveCount(0)
})

test('"Something else" cannot be sent without a description', async ({ page }) => {
  await signInWithMockedApi(page, tenant, propertyApi(false))
  await page.goto(`/properties/${propertyId}`)
  await page.getByRole('button', { name: 'Report listing' }).click()
  const dialog = page.getByRole('dialog', { name: 'Report listing' })
  await dialog.getByRole('radio', { name: 'Something else' }).check()
  await expect(dialog.getByRole('button', { name: 'Submit report' })).toBeDisabled()
  await dialog.getByLabel('Details (required)').fill('The photos are of a different building.')
  await expect(dialog.getByRole('button', { name: 'Submit report' })).toBeEnabled()
})

const business = { id: '507f1f77bcf86cd799439081', ownerId: '507f1f77bcf86cd799439082', name: 'Fixture Movers', category: 'moving', phone: '0240000000', city: 'Accra', isVerified: true, approvalStatus: 'approved', viewCount: 0, ratingAvg: 3, reviewCount: 2, subscriptionTier: 'free', createdAt: '2026-08-01T10:00:00.000Z' }
const businessReviews = [
  { id: 'business-review-1', businessId: business.id, authorId: '507f1f77bcf86cd799439083', authorName: 'Kofi', rating: 1, review: 'Insulting language from the crew.', createdAt: '2026-08-03T10:00:00.000Z', updatedAt: '2026-08-03T10:00:00.000Z' },
  { id: 'business-review-2', businessId: business.id, authorId: tenant.id, authorName: 'Ama', rating: 5, review: 'My own review.', createdAt: '2026-08-04T10:00:00.000Z', updatedAt: '2026-08-04T10:00:00.000Z' },
]
const businessApi: MockHandler = ({ path }) => {
  if (path === '/businesses') return { data: { items: [{ business, listings: [] }] } }
  if (path === `/businesses/${business.id}`) return { data: { business, listings: [] } }
  if (path === `/businesses/${business.id}/reviews`) return { data: { items: businessReviews, canReview: false } }
  return undefined
}

test('a business and a business review are reported with their own target types', async ({ page }) => {
  const reports: Report[] = []
  await signInWithMockedApi(page, tenant, reportsApi(reports, businessApi, (body) =>
    body.targetType === 'business' ? { status: 409, error: 'You have already reported this — our team is looking at it.' } : undefined))
  await page.goto('/local-services')
  await page.getByRole('heading', { name: 'Fixture Movers' }).click()
  const sheet = page.getByRole('dialog', { name: 'Fixture Movers' })
  // The admin-approval flag is described as what it is.
  await expect(sheet.getByText('Profile reviewed by RentOS')).toBeVisible()
  await expect(sheet.getByText('Insulting language from the crew.')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Report review' })).toHaveCount(1)

  await sheet.getByRole('button', { name: 'Report review' }).click()
  await fileReport(page, 'Report review', 'Spam or advertising')
  await expectSent(page)
  expect(reports).toEqual([{ targetType: 'business_review', targetId: 'business-review-1', reason: 'spam' }])

  // A refusal from the API is shown in the dialog, which stays open.
  await sheet.getByRole('button', { name: 'Report business' }).click()
  const dialog = await fileReport(page, 'Report business', 'Scam or fraud', 'Took a deposit and never came.')
  await expect(dialog.getByRole('alert')).toHaveText('You have already reported this — our team is looking at it.')
  await expect(dialog.getByRole('button', { name: 'Submit report' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(sheet).toBeVisible()
})

test('a business owner sees no report control for their own business', async ({ page }) => {
  await signInWithMockedApi(page, { ...tenant, id: business.ownerId }, businessApi)
  await page.goto('/local-services')
  await page.getByRole('heading', { name: 'Fixture Movers' }).click()
  const sheet = page.getByRole('dialog', { name: 'Fixture Movers' })
  await expect(sheet.getByText('Insulting language from the crew.')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Report business' })).toHaveCount(0)
  // Reviews of the business are the customers', so the owner can still report them.
  await expect(sheet.getByRole('button', { name: 'Report review' })).toHaveCount(2)
})

const workerId = '507f1f77bcf86cd799439091'
const workerUserId = '507f1f77bcf86cd799439092'
const worker = {
  _id: workerId, userId: workerUserId, name: 'Yaw Plumber', phone: '0240000001', trades: ['plumbing'], skills: [], bio: 'Twenty years of pipes.',
  location: 'Accra', serviceRadiusKm: 10, fixedRates: [], availability: { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] },
  status: 'available', verificationLevel: 'basic', rating: 3, reviewCount: 2, completedJobs: 2, emergencyAvailable: false,
}
const workerApi: MockHandler = ({ path }) => {
  if (path === `/workers/${workerId}`) return { data: worker }
  if (path === `/workers/${workerId}/reviews`) return { data: { reviews: [
    { id: 'booking-1', mine: false, rating: 1, review: 'Left water everywhere and shouted at us.', createdAt: '2026-08-05T10:00:00.000Z', type: 'plumbing' },
    { id: 'booking-2', mine: true, rating: 5, review: 'My own review of the job.', createdAt: '2026-08-06T10:00:00.000Z', type: 'plumbing' },
  ] } }
  return undefined
}

test('a worker and a worker review (keyed by booking) are reported', async ({ page }) => {
  const reports: Report[] = []
  await signInWithMockedApi(page, tenant, reportsApi(reports, workerApi))
  await page.goto(`/workers/${workerId}`)
  await expect(page.getByText('Left water everywhere and shouted at us.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Report review' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Report review' }).click()
  await fileReport(page, 'Report review', 'Offensive, abusive or hateful')
  await expectSent(page)

  await page.getByRole('button', { name: 'Report worker' }).click()
  await fileReport(page, 'Report worker', 'False or misleading', 'Claims trades he does not do.')
  await expectSent(page)
  expect(reports).toEqual([
    { targetType: 'worker_review', targetId: 'booking-1', reason: 'offensive_content' },
    { targetType: 'worker', targetId: workerId, reason: 'misleading_listing', details: 'Claims trades he does not do.' },
  ])
})

test('a worker sees no report control on their own profile', async ({ page }) => {
  await signInWithMockedApi(page, { ...tenant, id: workerUserId }, workerApi)
  await page.goto(`/workers/${workerId}`)
  await expect(page.getByText('Left water everywhere and shouted at us.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Report worker' })).toHaveCount(0)
})

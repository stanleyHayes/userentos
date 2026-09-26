import { test, expect } from '@playwright/test'
import { signInWithMockedApi } from '../helpers/mockedWeb'

// Runs against a Vite dev server with every API response mocked:
//   PLAYWRIGHT_BASE_URL=http://localhost:5602 npx playwright test -c playwright.web-mocked.config.ts
test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'Requires a web dev server at PLAYWRIGHT_BASE_URL')

const admin = { id: '507f1f77bcf86cd799439201', email: 'admin@rentos.test', firstName: 'Adwoa', lastName: 'Admin', phone: '0241234567', roles: ['admin'], activeRole: 'admin' }
const landlord = { ...admin, id: '507f1f77bcf86cd799439202', email: 'owner@rentos.test', firstName: 'Kojo', roles: ['landlord'], activeRole: 'landlord' }

const listing = (id: string, extra: Record<string, unknown>) => ({
  id, _id: id, landlordId: landlord.id, title: `Listing ${id}`, description: 'Two-bedroom flat near the Ring Road.', type: 'apartment',
  status: 'available', listingStatus: 'pending_review', address: { street: '1 Ring Rd', city: 'Accra', region: 'Greater Accra' },
  rentAmount: 2500, rentDurationMonths: 12, advanceMonths: 6, images: [], videos: [], rules: [], amenities: [], views: 0,
  createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-20T10:00:00.000Z', ...extra,
})

test('a moderator approves, and rejects with a reason code, from the listing page', async ({ page }) => {
  const listings: Record<string, ReturnType<typeof listing>> = {
    'prop-approve': listing('prop-approve', {}),
    'prop-reject': listing('prop-reject', {}),
  }
  const decisions: { id: string; body: unknown }[] = []
  await signInWithMockedApi(page, admin, ({ method, path, body }) => {
    const detail = path.match(/^\/properties\/([^/]+)$/)
    if (method === 'GET' && detail && listings[detail[1]]) return { data: listings[detail[1]] }
    const review = path.match(/^\/properties\/([^/]+)\/review$/)
    if (method === 'POST' && review) {
      // The moderation route refuses anything but { action, reasonCode, note }.
      const decision = body as { action?: string; reasonCode?: string }
      if (!decision.action || (decision.action === 'reject' && !decision.reasonCode)) return { status: 400, error: 'A reason code is required when rejecting a property' }
      decisions.push({ id: review[1], body })
      listings[review[1]] = { ...listings[review[1]], listingStatus: decision.action === 'approve' ? 'approved' : 'rejected' }
      return { data: { id: review[1], listingStatus: listings[review[1]].listingStatus } }
    }
    return undefined
  })

  await page.goto('/properties/prop-approve')
  await page.getByRole('button', { name: 'Approve Listing' }).click({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Approve Listing' })).toHaveCount(0)
  expect(decisions).toEqual([{ id: 'prop-approve', body: { action: 'approve' } }])

  await page.goto('/properties/prop-reject')
  await page.getByRole('button', { name: 'Reject Listing' }).click({ timeout: 20_000 })
  const dialog = page.getByRole('dialog', { name: 'Reject Property Listing' })
  const confirm = dialog.getByRole('button', { name: 'Reject Listing' })
  await expect(confirm).toBeDisabled()
  await dialog.getByRole('combobox', { name: 'Reason' }).click()
  await page.getByRole('option', { name: 'Photos unusable or missing' }).click()
  await dialog.getByLabel('Rejection Reason').fill('The photos show a different building.')
  await confirm.click()
  await expect(dialog).toHaveCount(0)
  expect(decisions.at(-1)).toEqual({ id: 'prop-reject', body: { action: 'reject', reasonCode: 'poor_media', note: 'The photos show a different building.' } })
})

test('an owner sees what a reviewer asked to change, edits the listing and resubmits', async ({ page }) => {
  let current = listing('prop-changes', {
    listingStatus: 'changes_requested',
    rejectionReason: 'Nearly there, two things to fix.',
    reviewIssues: ['Add interior photos of the kitchen', 'State the monthly service charge'],
  })
  const published: string[] = []
  const edits: Record<string, unknown>[] = []
  await signInWithMockedApi(page, landlord, ({ method, path, body }) => {
    if (method === 'GET' && path === '/properties/prop-changes') return { data: current }
    if (method === 'PATCH' && path === '/properties/prop-changes') {
      edits.push(body as Record<string, unknown>)
      current = { ...current, ...(body as object) }
      return { data: current }
    }
    if (method === 'POST' && path === '/properties/prop-changes/publish') {
      published.push(path)
      current = { ...current, listingStatus: 'pending_review', reviewIssues: [] }
      return { data: current }
    }
    return undefined
  })

  await page.goto('/properties/prop-changes')
  await expect(page.getByText('Changes Requested').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Nearly there, two things to fix.')).toBeVisible()
  await expect(page.getByText('Add interior photos of the kitchen')).toBeVisible()
  await expect(page.getByText('State the monthly service charge')).toBeVisible()
  // Fix what was asked: the service charge goes in the description.
  await page.getByRole('button', { name: 'Edit listing' }).click()
  const dialog = page.getByRole('dialog')
  const description = dialog.getByLabel('Description')
  await description.fill(`${await description.inputValue()} Service charge: GHS 150 a month.`)
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(dialog).toHaveCount(0)
  expect(edits.at(-1)?.description).toContain('Service charge: GHS 150 a month.')
  await page.getByRole('button', { name: 'Resubmit for review' }).click()
  await expect(page.getByText('Pending Review').first()).toBeVisible()
  expect(published).toHaveLength(1)
})

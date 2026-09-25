import { test, expect } from '@playwright/test'
import { signInWithMockedApi } from '../helpers/mockedWeb'

// Runs against a Vite dev server with every API response mocked:
//   PLAYWRIGHT_BASE_URL=http://localhost:5602 npx playwright test -c playwright.web-mocked.config.ts
test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'Requires a web dev server at PLAYWRIGHT_BASE_URL')

const admin = { id: '507f1f77bcf86cd799439101', email: 'admin@rentos.test', firstName: 'Adwoa', lastName: 'Admin', phone: '0241234567', roles: ['admin'], activeRole: 'admin' }
const submission = (id: string, title: string) => ({
  id, _id: id, kind: 'offplan_listing', ownerId: '507f1f77bcf86cd799439102', status: 'pending_review',
  data: { title, amount: 450000, scheduledDate: '2027-06-01' }, createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-20T10:00:00.000Z',
})

test('an admin approves and rejects off-plan submissions from the review queue', async ({ page }) => {
  let queue = [submission('offplan-1', 'Airport Hills Phase 2'), submission('offplan-2', 'East Legon Towers')]
  // Fails until the admin retries, so React Query's own retries still end in the error state.
  let failing = true
  const decisions: { id: string; body: unknown }[] = []
  await signInWithMockedApi(page, admin, ({ method, path, body }) => {
    if (method === 'GET' && path === '/capabilities/workflows/review-queue') {
      if (failing) return { status: 500, error: 'Unavailable' }
      return { data: { items: queue } }
    }
    const review = path.match(/^\/capabilities\/workflows\/([^/]+)\/review$/)
    if (method === 'POST' && review) {
      decisions.push({ id: review[1], body })
      queue = queue.filter((item) => item.id !== review[1])
      return { data: { id: review[1] } }
    }
    return undefined
  })
  await page.goto('/admin/offplan-reviews')

  // Error state with a working retry.
  await expect(page.getByRole('alert')).toContainText('Could not load the review queue.', { timeout: 20_000 })
  failing = false
  await page.getByRole('button', { name: 'Retry' }).click()

  const first = page.getByRole('group', { name: 'Airport Hills Phase 2' })
  await expect(first).toContainText('expected 2027-06-01')
  await expect(first).toContainText('Pending review')
  await first.getByRole('button', { name: 'Approve and publish' }).click()
  await expect(first).toHaveCount(0)
  expect(decisions).toEqual([{ id: 'offplan-1', body: { decision: 'approve' } }])

  const second = page.getByRole('group', { name: 'East Legon Towers' })
  await second.getByRole('button', { name: 'Reject' }).click()
  const confirm = second.getByRole('button', { name: 'Confirm rejection' })
  await expect(confirm).toBeDisabled()
  await second.getByLabel('Reason for rejection').fill('Remove the guaranteed-returns claim from the title.')
  await confirm.click()
  await expect(page.getByText('Nothing awaiting review')).toBeVisible()
  expect(decisions.at(-1)).toEqual({ id: 'offplan-2', body: { decision: 'reject', reason: 'Remove the guaranteed-returns claim from the title.' } })
})

test('the queue is linked from the admin sidebar', async ({ page }) => {
  await signInWithMockedApi(page, admin, () => undefined)
  await page.goto('/admin/offplan-reviews')
  await expect(page.getByText('Nothing awaiting review')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('link', { name: 'Off-plan Reviews' })).toHaveAttribute('href', '/admin/offplan-reviews')
})

test('a landlord is sent away from the review queue', async ({ page }) => {
  await signInWithMockedApi(page, { ...admin, roles: ['landlord'], activeRole: 'landlord' }, () => undefined)
  await page.goto('/admin/offplan-reviews')
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 })
})

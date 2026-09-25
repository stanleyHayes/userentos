import { test, expect, type Page } from '@playwright/test'
import { allRegulatedFeatures } from '../helpers/regulatedFeatures'
const mobileUrl = process.env.MOBILE_WEB_URL
test.skip(!mobileUrl, 'Requires Expo web at MOBILE_WEB_URL')

const customer = { id: '507f1f77bcf86cd799439111', email: 'customer@rentos.test', firstName: 'Abena', lastName: 'Customer', phone: '0241234567', roles: ['tenant'], activeRole: 'tenant', isVerified: false }
const bookingId = '507f1f77bcf86cd799439112'
const proposed = {
  id: bookingId, type: 'plumbing', description: 'Replace the burst pipe', status: 'in_progress', paymentStatus: 'pending',
  quoteAmount: 200, quoteAccepted: true, proposedFinalCost: 260, notes: [], requesterId: customer.id, createdAt: '2026-09-01T10:00:00.000Z',
}

async function openBookings(page: Page, asWorker: boolean, patch: (body: Record<string, unknown>) => { status: number; body: unknown }, overrides: Record<string, unknown> = {}) {
  const patches: Record<string, unknown>[] = []
  let booking: Record<string, unknown> = { ...proposed, ...overrides }
  await page.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    if (request.method() === 'PATCH' && path === `/api/service-bookings/${bookingId}`) {
      const body = request.postDataJSON() as Record<string, unknown>
      patches.push(body)
      const answer = patch(body)
      if (answer.status < 400) {
        // What the API does (services/bookingPricing.ts): approval applies the
        // figure, declining drops it and keeps the accepted quote.
        const { proposedFinalCost, ...rest } = booking
        booking = body.approveFinalCost ? { ...rest, finalCost: proposedFinalCost } : rest
      }
      await route.fulfill({ status: answer.status, json: answer.body })
      return
    }
    let data: unknown = { items: [], total: 0 }
    if (path === '/api/auth/login') data = { user: customer, token: 'bookings-token', refreshToken: 'bookings-refresh' }
    else if (path === '/api/users/me') data = customer
    else if (path === '/api/chat/unread-count') data = { count: 0 }
    else if (path === '/api/platform/features') data = allRegulatedFeatures
    else if (path === '/api/service-bookings') data = { items: (url.searchParams.get('asWorker') === 'true') === asWorker ? [booking] : [] }
    await route.fulfill({ json: { success: true, data } })
  })
  await page.goto(`${mobileUrl}/auth/login`)
  await page.getByPlaceholder('you@example.com').fill(customer.email)
  await page.getByPlaceholder('Enter your password').fill('E2e!Password123')
  await page.getByText('Sign in', { exact: true }).click()
  await page.getByText('Profile', { exact: true }).last().click()
  await page.getByText('My Bookings', { exact: true }).click()
  if (asWorker) await page.getByText('My Jobs', { exact: true }).click()
  await expect(page.getByText('Replace the burst pipe', { exact: true })).toBeVisible()
  return patches
}

const ok = () => ({ status: 200, body: { success: true, data: {} } })

test('a customer approves a raised final cost', async ({ page }) => {
  const patches = await openBookings(page, false, ok)
  await expect(page.getByText('The worker has asked for a higher final cost', { exact: true })).toBeVisible()
  await expect(page.getByText(/New final cost GH₵260 \(accepted quote GH₵200\)/)).toBeVisible()
  await page.getByRole('button', { name: 'Approve new price of GH₵260' }).click()
  await expect(page.getByText('The worker has asked for a higher final cost', { exact: true })).toHaveCount(0)
  expect(patches).toEqual([{ approveFinalCost: true }])
})

test('a customer keeps the accepted quote, and a failed answer is shown inline', async ({ page }) => {
  let fail = true
  const patches = await openBookings(page, false, () => fail
    ? { status: 409, body: { success: false, error: 'This booking is paid; its price can no longer change.' } }
    : ok())
  await page.getByRole('button', { name: 'Decline new price and keep the quote' }).click()
  await expect(page.getByText('This booking is paid; its price can no longer change.', { exact: true })).toBeVisible()
  // Still waiting for an answer: nothing was applied.
  await expect(page.getByText('The worker has asked for a higher final cost', { exact: true })).toBeVisible()
  fail = false
  await page.getByRole('button', { name: 'Decline new price and keep the quote' }).click()
  await expect(page.getByText('The worker has asked for a higher final cost', { exact: true })).toHaveCount(0)
  expect(patches).toEqual([{ approveFinalCost: false }, { approveFinalCost: false }])
})

test('the worker sees the proposal waiting, without approval buttons', async ({ page }) => {
  await openBookings(page, true, ok)
  await expect(page.getByText('Waiting for the customer to approve', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve new price of GH₵260' })).toHaveCount(0)
})

test('a paid booking offers no price to answer: its price is locked', async ({ page }) => {
  await openBookings(page, false, ok, { status: 'completed', paymentStatus: 'paid' })
  await expect(page.getByText('The worker has asked for a higher final cost', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Approve new price of GH₵260' })).toHaveCount(0)
})

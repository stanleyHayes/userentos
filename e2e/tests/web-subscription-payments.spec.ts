import { test, expect, type Page } from '@playwright/test'
import { signInWithMockedApi, type MockHandler } from '../helpers/mockedWeb'

// Runs against a Vite dev server with every API response mocked:
//   PLAYWRIGHT_BASE_URL=http://localhost:5602 npx playwright test -c playwright.web-mocked.config.ts
test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'Requires a web dev server at PLAYWRIGHT_BASE_URL')

const agent = { id: '507f1f77bcf86cd799439401', email: 'agent@rentos.test', firstName: 'Kwadwo', lastName: 'Agent', phone: '0241234567', roles: ['property_manager'], activeRole: 'property_manager' }
const starter = { id: 'starter', name: 'Starter', price: 0, billingCycle: 'monthly', maxProperties: 3, benefits: ['3 listings'], isActive: true }
const professional = { id: 'professional', name: 'Professional', price: 150, billingCycle: 'monthly', maxProperties: -1, benefits: ['Unlimited listings'], isActive: true }

/** The plans page, on Starter, with the given payment methods and checkout answers. */
async function plansPage(page: Page, methods: { id: string; label: string }[], checkout: MockHandler = () => undefined) {
  await signInWithMockedApi(page, agent, (request) => {
    const { method, path } = request
    if (method === 'GET' && path === '/subscriptions/packages') return { data: { items: [starter, professional], total: 2 } }
    if (method === 'GET' && path === '/subscriptions/my-subscription') return { data: { package: starter, billingSource: 'free', propertyCount: 1, maxProperties: 3, canAddProperty: true } }
    if (method === 'GET' && path === '/payments/methods') return { data: { methods, mode: 'live' } }
    return checkout(request)
  })
  await page.goto('/subscription')
  await page.getByRole('button', { name: /Upgrade/ }).click()
}

test('with no payment method set up, the upgrade dialog says so and offers nothing to pay with', async ({ page }) => {
  await plansPage(page, [])
  await expect(page.getByText('Payments are not available yet')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Pay & Subscribe' })).toHaveCount(0)
})

test('a payment already in progress is checked, never charged again', async ({ page }) => {
  const calls: string[] = []
  let checks = 0
  await plansPage(page, [{ id: 'mtn_momo', label: 'MTN Mobile Money' }], ({ method, path }) => {
    if (method === 'POST' && path === '/subscriptions/subscribe') {
      calls.push('subscribe')
      return { status: 409, code: 'PAYMENT_IN_PROGRESS', error: 'A payment for this is already in progress.', data: { payment: { id: 'pay-open', status: 'processing' } } }
    }
    if (method === 'GET' && path === '/payments/pay-open') {
      calls.push('check')
      checks += 1
      // Read once when the panel opens, then on "Check again".
      return { data: { id: 'pay-open', status: checks === 1 ? 'processing' : 'completed', payerCancellable: false } }
    }
    return undefined
  })
  await page.getByLabel('Mobile money number').fill('0241234567')
  await page.getByRole('button', { name: 'Pay & Subscribe' }).click()
  await expect(page.getByText('A payment for this plan is already in progress')).toBeVisible({ timeout: 20_000 })
  await expect.poll(() => checks).toBe(1)
  // A Paystack charge is never offered for cancelling: its prompt may still be approved.
  await expect(page.getByRole('button', { name: /Cancel/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Check again' }).click()
  await expect(page.getByText('Subscription activated!')).toBeVisible()
  // Checking reads the payment; it never sends the checkout again.
  expect(calls).toEqual(['subscribe', 'check', 'check'])
})

test('an unconfirmed payment can only be checked, and one that failed brings the form back', async ({ page }) => {
  let checks = 0
  await plansPage(page, [{ id: 'mtn_momo', label: 'MTN Mobile Money' }], ({ method, path }) => {
    if (method === 'POST' && path === '/subscriptions/subscribe') {
      return { status: 502, code: 'PAYMENT_UNCONFIRMED', error: "We couldn't confirm this payment yet. We're checking it with the provider; try again in a few minutes.", data: { payment: { id: 'pay-unsure' } } }
    }
    if (method === 'GET' && path === '/payments/pay-unsure') {
      checks += 1
      return { data: { id: 'pay-unsure', status: checks === 1 ? 'processing' : 'failed', payerCancellable: false } }
    }
    return undefined
  })
  await page.getByLabel('Mobile money number').fill('0241234567')
  await page.getByRole('button', { name: 'Pay & Subscribe' }).click()
  await expect(page.getByText("We couldn't confirm this payment yet")).toBeVisible({ timeout: 20_000 })
  await expect.poll(() => checks).toBe(1)
  await expect(page.getByRole('button', { name: /Cancel/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Check again' }).click()
  await expect(page.getByText('Nothing was charged; you can pay again.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pay & Subscribe' })).toBeVisible()
})

test('a bank transfer in progress shows its own details and can be cancelled to pay another way', async ({ page }) => {
  const calls: string[] = []
  await plansPage(page, [{ id: 'mtn_momo', label: 'MTN Mobile Money' }, { id: 'bank_transfer', label: 'Bank transfer' }], ({ method, path }) => {
    if (method === 'POST' && path === '/subscriptions/subscribe') {
      calls.push('subscribe')
      return { status: 409, code: 'PAYMENT_IN_PROGRESS', error: 'A payment for this is already in progress.', data: { payment: { id: 'pay-bank', status: 'pending' }, instructions: 'Transfer GH₵150 to RentOS, account 1234567890, reference SUB-BANK.' } }
    }
    if (method === 'GET' && path === '/payments/pay-bank') { calls.push('check'); return { data: { id: 'pay-bank', status: 'pending', payerCancellable: true } } }
    if (method === 'POST' && path === '/payments/pay-bank/cancel') { calls.push('cancel'); return { data: { id: 'pay-bank', status: 'failed', payerCancellable: false } } }
    return undefined
  })
  await page.getByLabel('Mobile money number').fill('0241234567')
  await page.getByRole('button', { name: 'Pay & Subscribe' }).click()
  await expect(page.getByText('Transfer GH₵150 to RentOS, account 1234567890, reference SUB-BANK.')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Cancel this payment' }).click()
  await expect(page.getByText('Payment cancelled. You can pay another way.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pay & Subscribe' })).toBeVisible()
  expect(calls).toEqual(['subscribe', 'check', 'cancel'])
})

test('a retried payment that already went through says the plan is active, not that it is waiting', async ({ page }) => {
  await plansPage(page, [{ id: 'mtn_momo', label: 'MTN Mobile Money' }], ({ method, path }) => (
    method === 'POST' && path === '/subscriptions/subscribe'
      ? { data: { payment: { id: 'pay-done', reference: 'SUB-DONE', status: 'completed' } } }
      : undefined
  ))
  await page.getByLabel('Mobile money number').fill('0241234567')
  await page.getByRole('button', { name: 'Pay & Subscribe' }).click()
  await expect(page.getByText('Subscription activated!')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Complete your payment')).toHaveCount(0)
})

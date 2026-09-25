import { test, expect, type Page } from '@playwright/test'
import { allRegulatedFeatures } from '../helpers/regulatedFeatures'

const mobileUrl = process.env.MOBILE_WEB_URL
test.skip(!mobileUrl, 'Requires an Expo web server at MOBILE_WEB_URL')

async function login(page: Page, role: string, methodsFail = false) {
  const user = { id: '507f1f77bcf86cd799439011', email: 'billing@rentos.test', firstName: 'Billing', lastName: 'Fixture', phone: '0241234567', roles: [role], activeRole: role, isVerified: true }
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    let data: unknown = { items: [], total: 0 }
    if (path === '/api/auth/login') data = { user, token: 'fixture-token' }
    if (path === '/api/users/me') data = user
    if (path === '/api/platform/features') data = allRegulatedFeatures
    if (path === '/api/savings/wallet') data = { balance: 100, transactions: [] }
    if (path === '/api/subscriptions/packages') data = { items: [{ id: 'yearly', name: 'Annual Plan', price: 120, billingCycle: 'yearly', maxProperties: 5, benefits: ['Five property listings'] }] }
    if (path === '/api/subscriptions/my-subscription') data = { package: null, propertyCount: 0, maxProperties: 0 }
    if (path === '/api/payments/methods') {
      if (methodsFail) return route.fulfill({ status: 503, json: { success: false, message: 'Unavailable' } })
      data = { methods: [{ id: 'bank_transfer', label: 'Bank Transfer' }], mode: 'simulated' }
    }
    if (path === '/api/agreements') data = { items: [{ id: 'agreement-1', status: 'active', rentAmount: 1000, property: { title: 'Test tenancy' } }] }
    if (path === '/api/payments' && route.request().method() === 'POST') { expect(route.request().postDataJSON().rentPeriod).toEqual({ startDate: '2026-09-01', endDate: '2026-09-30' }); data = { instructions: 'Transfer to fixture account 123456 using reference FIXTURE-123.' } }
    await route.fulfill({ json: { success: true, data } })
  })
  await page.goto(`${mobileUrl}/auth/login`)
  await page.getByPlaceholder('you@example.com').fill(user.email)
  await page.getByPlaceholder('Enter your password').fill('E2e!Password123')
  await page.getByText('Sign in', { exact: true }).click()
  await page.getByText('Profile', { exact: true }).last().click()
}

test('native subscription renders server benefits and yearly pricing with available rails only', async ({ page }) => {
  await login(page, 'landlord')
  await page.getByText('Subscription', { exact: true }).click()
  await expect(page.getByText('Five property listings', { exact: true })).toBeVisible()
  await expect(page.getByText('/year', { exact: true })).toBeVisible()
  await page.getByText('Subscribe', { exact: true }).click()
  await expect(page.getByText('Bank Transfer', { exact: true })).toBeVisible()
  await expect(page.getByText('MTN MoMo', { exact: true })).toHaveCount(0)
})

test('native rent payment keeps provider instructions visible', async ({ page }) => {
  await login(page, 'tenant')
  await page.getByText('Payments', { exact: true }).click()
  await page.getByRole('button', { name: 'Make payment', exact: true }).click()
  await page.getByText('Test tenancy', { exact: true }).click()
  await page.getByText('Bank Transfer', { exact: true }).click()
  await expect(page.getByText('MTN MoMo', { exact: true })).toHaveCount(0)
  await page.getByLabel('Rent period from').fill('2026-09-01')
  await page.getByLabel('Rent period through').fill('2026-09-30')
  await page.getByText('Submit Payment', { exact: true }).click()
  await expect(page.getByText('Transfer to fixture account 123456 using reference FIXTURE-123.', { exact: true })).toBeVisible()
})

test('mobile deposit shows only available rails and retains instructions', async ({ page }) => {
  await login(page, 'tenant')
  await page.route('**/api/savings/wallet/deposit', route => route.fulfill({ json: { success: true, data: { instructions: 'Deposit using original reference WALLET-123.' } } }))
  await page.getByText('RentGuard', { exact: true }).last().click()
  await page.getByText('Deposit', { exact: true }).click()
  await expect(page.getByText('Bank Transfer', { exact: true })).toBeVisible()
  await expect(page.getByText('MTN MoMo', { exact: true })).toHaveCount(0)
  await page.getByPlaceholder('0.00').fill('10')
  await page.getByText('Bank Transfer', { exact: true }).click()
  await page.getByText('Deposit', { exact: true }).last().click()
  await expect(page.getByText('Deposit using original reference WALLET-123.', { exact: true })).toBeVisible()
})

for (const scenario of ['unavailable', 'incomplete']) test(`mobile wallet ${scenario} response does not display a zero balance and can recover`, async ({ page }) => {
  await login(page, 'tenant')
  let fail = true
  await page.route('**/api/savings/wallet', route => route.fulfill(fail ? (scenario === 'unavailable' ? { status: 503, json: { error: 'Unavailable' } } : { json: { data: {} } }) : { json: { data: { balance: 100, transactions: [] } } }))
  await page.getByText('RentGuard', { exact: true }).last().click()
  await expect(page.getByText('Could not load wallet and savings data.', { exact: true })).toBeVisible()
  await expect(page.getByText('Wallet Balance', { exact: true })).toHaveCount(0)
  fail = false
  await page.getByText('Retry wallet and savings', { exact: true }).click()
  await expect(page.getByText('Wallet Balance', { exact: true })).toBeVisible()
  await expect(page.getByText('Could not load wallet and savings data.', { exact: true })).toHaveCount(0)
})

test('mobile deposit exposes payment-method load failures and can retry without losing the amount', async ({ page }) => {
  await login(page, 'tenant')
  let fail = true
  await page.route('**/api/payments/methods', route => route.fulfill(fail ? { status: 503, json: { error: 'Unavailable' } } : { json: { data: { methods: [{ id: 'bank_transfer', label: 'Bank Transfer' }] } } }))
  await page.getByText('RentGuard', { exact: true }).last().click()
  await page.getByText('Deposit', { exact: true }).click()
  await expect(page.getByText('Could not load payment methods.', { exact: true })).toBeVisible()
  await page.getByPlaceholder('0.00').fill('10')
  await expect(page.getByText('Bank Transfer', { exact: true })).toHaveCount(0)
  fail = false
  await page.getByText('Retry payment methods', { exact: true }).click()
  await expect(page.getByText('Bank Transfer', { exact: true })).toBeVisible()
  await expect(page.getByPlaceholder('0.00')).toHaveValue('10')
})

test('mobile rent checkout reuses its key after a lost response', async ({ page }) => {
  await login(page, 'tenant')
  const keys: string[] = []
  await page.route('**/api/payments', async route => {
    if (route.request().method() !== 'POST') return route.fallback()
    keys.push(route.request().headers()['idempotency-key'])
    if (keys.length === 1) return route.abort('connectionreset')
    return route.fulfill({ json: { success: true, data: { instructions: 'Recovered original checkout' } } })
  })
  await page.getByText('Payments', { exact: true }).click()
  await page.getByRole('button', { name: 'Make payment', exact: true }).click()
  await page.getByText('Test tenancy', { exact: true }).click()
  await page.getByText('Bank Transfer', { exact: true }).click()
  await page.getByLabel('Rent period from').fill('2026-09-01')
  await page.getByLabel('Rent period through').fill('2026-09-30')
  await page.getByText('Submit Payment', { exact: true }).click()
  await expect.poll(() => keys.length).toBe(1)
  await page.getByText('Submit Payment', { exact: true }).click()
  await expect(page.getByText('Recovered original checkout', { exact: true })).toBeVisible()
  expect(keys[0]).toMatch(/^[\da-f-]{36}$/)
  expect(keys[1]).toBe(keys[0])
})

test('native rent payment shows a load error instead of inventing payment methods', async ({ page }) => {
  await login(page, 'tenant', true)
  await page.getByText('Payments', { exact: true }).click()
  await page.getByRole('button', { name: 'Make payment', exact: true }).click()
  await expect(page.getByText('Could not load payment options. Close this form and try again.', { exact: true })).toBeVisible()
  await expect(page.getByText('Bank Transfer', { exact: true })).toHaveCount(0)
})

test('mobile article renderer preserves Markdown structure and rejects executable markup', async ({ page }) => {
  await login(page, 'landlord')
  const post = { id: 'markdown-fixture', slug: 'markdown-fixture', title: 'Article rendering fixture', excerpt: 'Parser upgrade check', author: 'RentOS', tags: ['Guides'], createdAt: '2026-09-13T12:00:00Z', content: [
    '# Section heading', '', '**Bold statement** and *emphasis*.', '', '- First list item', '- Second list item', '',
    '> Quoted guidance', '', '```text', 'sample_code()', '```', '',
    '| Name | Value |', '| --- | --- |', '| Fixture row | Present |', '',
    '[Safe reference](https://example.com/guide)', '', '[Unsafe link](javascript:alert(1))', '',
    '<script>window.markdownExecuted = true</script>',
  ].join('\n') }
  await page.route('**/api/blog', route => route.fulfill({ json: { success: true, data: { items: [post] } } }))
  await page.route('**/api/blog/markdown-fixture', route => route.fulfill({ json: { success: true, data: post } }))
  await page.getByText('Blog', { exact: true }).click()
  await page.getByText(post.title, { exact: true }).click()
  for (const text of ['Section heading', 'Bold statement', 'First list item', 'Second list item', 'Quoted guidance', 'sample_code()', 'Fixture row', 'Safe reference']) {
    await expect(page.getByText(text, { exact: false }).first()).toBeVisible()
  }
  await expect(page.locator('script').filter({ hasText: 'markdownExecuted' })).toHaveCount(0)
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0)
  expect(await page.evaluate(() => 'markdownExecuted' in window)).toBe(false)
})

test('biometric device management remains reachable when local biometrics are unavailable', async ({ page }) => {
  await login(page, 'landlord')
  await page.getByText('Edit Profile', { exact: true }).click()
  await page.getByText('Security', { exact: true }).click()
  await expect(page.getByText('Manage biometric devices', { exact: true })).toBeVisible()
  await page.getByText('Manage biometric devices', { exact: true }).click()
  await expect(page).toHaveURL(/biometric-devices/)
})


test('AI sharing permission is required each time and cancellation preserves the question', async ({ page }) => {
  await login(page, 'tenant')
  await page.getByText('AI Legal Assistant', { exact: true }).click()
  const question = page.getByPlaceholder('Ask about rental law...')
  await question.fill('What are my rental rights?')
  let sent = 0
  await page.route('**/api/ai/chat', async route => {
    sent++
    expect(route.request().postDataJSON().aiSharingConsent).toBe('anthropic-openai-2026-09-13')
    await route.fulfill({ json: { success: true, data: { reply: 'Fixture legal answer' } } })
  })
  page.once('dialog', async dialog => {
    expect(dialog.message()).toContain('Anthropic')
    expect(dialog.message()).toContain('OpenAI')
    await dialog.dismiss()
  })
  await page.getByRole('button', { name: 'Send question' }).click()
  await expect(question).toHaveValue('What are my rental rights?')
  expect(sent).toBe(0)
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Send question' }).click()
  await expect(page.getByText('Fixture legal answer')).toBeVisible()
  expect(sent).toBe(1)
  await question.fill('A second question')
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: 'Send question' }).click()
  await expect(question).toHaveValue('A second question')
  expect(sent).toBe(1)
})

for (const role of ['tenant', 'landlord']) test(`mobile ${role} can retrieve a receipt and retry a failure`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, role)
  const owner = '507f1f77bcf86cd799439011'
  const payment = { id: '507f1f77bcf86cd799439012', tenantId: role === 'tenant' ? owner : 'other', landlordId: role === 'landlord' ? owner : 'other', amount: 1000, method: 'bank_transfer', status: 'refunded', reference: 'RECEIPT-FIXTURE', createdAt: '2026-09-01T00:00:00.000Z' }
  await page.route(url => url.pathname === '/api/payments', route => route.fulfill({ json: { success: true, data: { items: [payment, { ...payment, id: 'foreign', reference: 'FOREIGN', tenantId: 'other', landlordId: 'other' }], total: 2 } } }))
  let calls = 0
  await page.route(`**/api/payments/${payment.id}/receipt`, route => {
    expect(route.request().headers().authorization).toBe('Bearer fixture-token')
    expect(route.request().method()).toBe('POST')
    calls++
    if (calls === 1) return route.fulfill({ status: 409, json: { error: 'Receipt details unavailable. Try again.' } })
    return route.fulfill({ json: { success: true, data: { paymentStatus: 'refunded', receipt: { number: 'RNT-FIXTURE', paymentReference: payment.reference, amount: 1000, currency: 'GHS', tenantName: 'Akosua Ŋutifafa', landlordName: 'Kofi Mensah', propertyTitle: 'Apartment 4', premisesAddress: '10 Independence Avenue, Accra', furnished: false, periodStart: '2026-09-01', periodEnd: '2026-09-30', paidAt: '2026-09-01T08:00:00.000Z', issuedAt: '2026-09-01T08:01:00.000Z' } } } })
  })
  await page.getByText('Payments', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'View receipt FOREIGN', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'View receipt RECEIPT-FIXTURE', exact: true }).click()
  await expect(page.getByText('Receipt details unavailable. Try again.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Load receipt', exact: true }).click()
  await expect(page.getByText(/Payment refunded — original receipt retained/)).toBeVisible()
  await expect(page.getByText(/Furnishing: Unfurnished/)).toBeVisible()
  await expect(page.getByText(/Period through \(inclusive\): 2026-09-30/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Share receipt', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Refresh receipt status', exact: true }).click()
  await expect(page.getByText(/Receipt number: RNT-FIXTURE/)).toBeVisible()
  await page.screenshot({ path: `/tmp/rentos-mobile-receipt-${role}.png`, fullPage: true })
  await page.getByRole('button', { name: 'Close receipt', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Load receipt', exact: true })).toHaveCount(0)
  expect(calls).toBe(3)
})

test('mobile payment history exposes older receipts and retains server totals across pages', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'tenant')
  let first = true
  await page.route(url => url.pathname === '/api/payments', route => {
    if (first) { first = false; return route.fulfill({ status: 503, json: { error: 'Unavailable' } }) }
    const requestedPage = Number(new URL(route.request().url()).searchParams.get('page'))
    const item = { id: `payment-${requestedPage}`, tenantId: '507f1f77bcf86cd799439011', landlordId: 'landlord', amount: 1000, method: 'bank_transfer', status: 'completed', reference: requestedPage === 2 ? 'OLDER-RECEIPT' : 'NEWER-RECEIPT', createdAt: '2026-09-01T00:00:00Z' }
    return route.fulfill({ json: { success: true, data: { items: [item], page: requestedPage, total: 21, totalPages: 2, summary: { totalPaid: 21000 } } } })
  })
  await page.getByText('Payments', { exact: true }).click()
  await expect(page.getByText('Could not load payment history. Please try again.', { exact: true })).toBeVisible()
  await expect(page.getByText('No payments yet', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Retry payment history', exact: true }).click()
  await expect(page.getByText('21', { exact: true })).toBeVisible()
  await expect(page.getByText('NEWER-RECEIPT', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Next payments', exact: true }).click()
  await expect(page.getByText('OLDER-RECEIPT', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'View receipt OLDER-RECEIPT', exact: true })).toBeVisible()
  await expect(page.getByText('21', { exact: true })).toBeVisible()
  await expect(page.getByText('2 / 2', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Previous payments', exact: true }).click()
  await expect(page.getByText('NEWER-RECEIPT', { exact: true })).toBeVisible()
})

for (const scenario of ['unavailable', 'incomplete']) test(`mobile withdrawal ${scenario} availability recovers and uses saved account`, async ({ page }) => {
  await login(page, 'tenant')
  let fail = true
  let payout: unknown
  await page.route('**/api/payouts/available', route => route.fulfill(fail ? (scenario === 'unavailable' ? { status: 503, json: { error: 'Unavailable' } } : { json: { data: {} } }) : { json: { data: { balance: 100, minimum: 10, hasVerifiedAccount: true, payoutInProgress: false } } }))
  await page.route('**/api/payouts', route => { payout = route.request().postDataJSON(); return route.fulfill({ json: { data: { id: 'fixture-payout' } } }) })
  await page.getByText('RentGuard', { exact: true }).last().click()
  await page.getByText('Withdraw', { exact: true }).click()
  await expect(page.getByText('Could not check payout availability.', { exact: true })).toBeVisible()
  await expect(page.getByText('Payment Method', { exact: true })).toHaveCount(0)
  await expect(page.getByText('MTN MoMo', { exact: true })).toHaveCount(0)
  await page.getByPlaceholder('0.00').fill('10')
  expect(payout).toBeUndefined()
  fail = false
  await page.getByText('Retry payout availability', { exact: true }).click()
  await expect(page.getByText('Available to withdraw:', { exact: false })).toBeVisible()
  for (const invalidAmount of ['9', '101', 'Infinity']) {
    await page.getByPlaceholder('0.00').fill(invalidAmount)
    await expect(page.getByText('Withdraw', { exact: true }).last().locator('..')).toHaveAttribute('aria-disabled', 'true')
  }
  await page.getByPlaceholder('0.00').fill('10')
  await page.getByText('Withdraw', { exact: true }).last().click()
  await expect.poll(() => payout).toEqual({ amount: 10 })
})

for (const status of ['missing account', 'in progress']) test(`mobile withdrawal prevents requests with ${status}`, async ({ page }) => {
  await login(page, 'tenant')
  let submissions = 0
  await page.route('**/api/payouts/available', route => route.fulfill({ json: { data: { balance: 100, minimum: 10, hasVerifiedAccount: status !== 'missing account', payoutInProgress: status === 'in progress' } } }))
  await page.route('**/api/payouts', route => { submissions++; return route.fulfill({ json: { data: {} } }) })
  await page.getByText('RentGuard', { exact: true }).last().click()
  await page.getByText('Withdraw', { exact: true }).click()
  await expect(page.getByText(status === 'missing account' ? 'Add and verify a payout account' : 'A payout is already in progress.', { exact: false })).toBeVisible()
  await page.getByPlaceholder('0.00').fill('10')
  await expect(page.getByText('Withdraw', { exact: true }).last().locator('..')).toHaveAttribute('aria-disabled', 'true')
  expect(submissions).toBe(0)
  if (status === 'missing account') {
    await page.getByRole('button', { name: 'Set up payout account' }).click()
    await expect(page).toHaveURL(/payout-account/)
  }
})

test('mobile payout account retries loading and verification, then saves and removes with confirmation', async ({ page }) => {
  await login(page, 'tenant')
  let failLoad = true
  let failSave = true
  let saved: unknown
  let removed = 0
  await page.route('**/api/payouts/account', async route => {
    if (route.request().method() === 'PUT') {
      saved = route.request().postDataJSON()
      if (failSave) return route.fulfill({ status: 422, json: { error: 'Account verification failed' } })
      return route.fulfill({ json: { data: { ...(saved as object), bankName: 'Fixture network', accountName: 'Provider confirmed name', verified: true } } })
    }
    if (route.request().method() === 'DELETE') { removed++; return route.fulfill({ json: { data: null } }) }
    return route.fulfill(failLoad ? { status: 503, json: { message: 'Unavailable' } } : { json: { data: null } })
  })
  await page.route('**/api/payouts/destinations', route => route.fulfill({ json: { data: { items: [{ type: 'mobile_money', code: 'FIX', name: 'Fixture network' }] } } }))
  await page.getByText('Payout account', { exact: true }).click()
  await expect(page.getByText('Could not load payout account details.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Verify and save', exact: true })).toHaveCount(0)
  failLoad = false
  await page.getByRole('button', { name: 'Retry payout account' }).click()
  await page.getByRole('button', { name: 'Fixture network', exact: true }).click()
  await page.getByLabel('Payout account number').fill('0241234567')
  await page.getByLabel('Payout account name').fill('Entered name')
  await page.getByRole('button', { name: 'Verify and save', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Account verification failed')
  await expect(page.getByLabel('Payout account number')).toHaveValue('0241234567')
  failSave = false
  await page.getByRole('button', { name: 'Verify and save', exact: true }).click()
  await expect(page.getByText('Provider confirmed name', { exact: true })).toBeVisible()
  expect(saved).toEqual({ type: 'mobile_money', bankCode: 'FIX', accountNumber: '0241234567', accountName: 'Entered name' })
  await page.getByRole('button', { name: 'Change account', exact: true }).click()
  await expect(page.getByLabel('Payout account number')).toHaveValue('0241234567')
  await page.getByLabel('Payout account number').fill('0247654321')
  await page.getByRole('button', { name: 'Verify and save', exact: true }).click()
  await expect(page.getByText('Fixture network · 0247654321', { exact: true })).toBeVisible()
  expect(saved).toEqual({ type: 'mobile_money', bankCode: 'FIX', accountNumber: '0247654321', accountName: 'Provider confirmed name' })
  await page.getByRole('button', { name: 'Remove account', exact: true }).click()
  expect(removed).toBe(0)
  await page.getByRole('button', { name: 'Keep account', exact: true }).click()
  expect(removed).toBe(0)
  await page.getByRole('button', { name: 'Remove account', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm removal', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Payout account removed.')
  expect(removed).toBe(1)
})

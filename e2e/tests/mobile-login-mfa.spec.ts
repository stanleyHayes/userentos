import { test, expect, type Page } from '@playwright/test'
const mobileUrl = process.env.MOBILE_WEB_URL
test.skip(!mobileUrl, 'Requires Expo web at MOBILE_WEB_URL')

const user = { id: '507f1f77bcf86cd799439021', email: 'mfa@rentos.test', firstName: 'Mfa', lastName: 'Fixture', phone: '0241234567', roles: ['tenant'], activeRole: 'tenant', isVerified: true }

async function mockApi(page: Page, mfaResponse: (code: string) => { status: number; body: unknown }) {
  const mfaRequests: { mfaToken?: string; code?: string }[] = []
  const authenticatedRequests: string[] = []
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/auth/login') {
      await route.fulfill({ json: { success: true, data: { mfaRequired: true, mfaToken: 'challenge-token' } } })
      return
    }
    if (path === '/api/auth/login/mfa') {
      const body = request.postDataJSON() as { mfaToken?: string; code?: string }
      mfaRequests.push(body)
      const result = mfaResponse(body.code ?? '')
      await route.fulfill({ status: result.status, json: result.body })
      return
    }
    if (request.headers().authorization) authenticatedRequests.push(path)
    let data: unknown = { items: [], total: 0 }
    if (path === '/api/users/me') data = user
    if (path === '/api/chat/unread-count') data = { count: 0 }
    await route.fulfill({ json: { success: true, data } })
  })
  return { mfaRequests, authenticatedRequests }
}

async function submitPassword(page: Page) {
  await page.goto(`${mobileUrl}/auth/login`)
  await page.getByPlaceholder('you@example.com').fill(user.email)
  await page.getByPlaceholder('Enter your password').fill('E2e!Password123')
  await page.getByText('Sign in', { exact: true }).click()
}

test('an MFA account must pass the TOTP step before any session exists', async ({ page }) => {
  const api = await mockApi(page, code => code === '123456'
    ? { status: 200, body: { success: true, data: { user, token: 'mfa-access-token', refreshToken: 'mfa-refresh-token' } } }
    : { status: 401, body: { success: false, error: 'Invalid authentication code' } })
  await submitPassword(page)

  // The challenge response is not a session: the code step shows and no
  // signed-in screen or authenticated request happens.
  await expect(page.getByText('Two-factor authentication', { exact: true })).toBeVisible()
  const code = page.getByLabel('Authentication code')
  await expect(code).toBeVisible()
  await expect(page.getByText('Profile', { exact: true })).toHaveCount(0)
  expect(api.authenticatedRequests).toEqual([])

  await code.fill('12a34')
  await expect(code).toHaveValue('1234')
  await code.fill('000000')
  await page.getByRole('button', { name: 'Verify code' }).click()
  await expect(page.getByText('Invalid authentication code', { exact: true })).toBeVisible()
  await expect(page.getByText('Profile', { exact: true })).toHaveCount(0)

  await code.fill('123456')
  await page.getByRole('button', { name: 'Verify code' }).click()
  await expect(page.getByText('Profile', { exact: true }).last()).toBeVisible()
  expect(api.mfaRequests).toEqual([{ mfaToken: 'challenge-token', code: '000000' }, { mfaToken: 'challenge-token', code: '123456' }])
  await expect.poll(() => api.authenticatedRequests.length).toBeGreaterThan(0)
})

test('a verification response without a user and token does not sign the account in', async ({ page }) => {
  const api = await mockApi(page, () => ({ status: 200, body: { success: true, data: { mfaRequired: true } } }))
  await submitPassword(page)
  await page.getByLabel('Authentication code').fill('123456')
  await page.getByRole('button', { name: 'Verify code' }).click()
  await expect(page.getByText('Unexpected response from the server. Please try again.', { exact: true })).toBeVisible()
  await expect(page.getByText('Profile', { exact: true })).toHaveCount(0)
  expect(api.authenticatedRequests).toEqual([])
})

test('an expired MFA challenge returns to the password step', async ({ page }) => {
  await mockApi(page, () => ({ status: 401, body: { success: false, error: 'MFA session expired. Please log in again.' } }))
  await submitPassword(page)
  await page.getByLabel('Authentication code').fill('123456')
  await page.getByRole('button', { name: 'Verify code' }).click()
  await expect(page.getByText('MFA session expired. Please log in again.', { exact: true })).toBeVisible()
  await expect(page.getByPlaceholder('Enter your password')).toBeVisible()
  await expect(page.getByLabel('Authentication code')).toHaveCount(0)
})

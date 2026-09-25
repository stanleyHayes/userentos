import { test, expect, type Page } from '@playwright/test'
import { allRegulatedFeatures } from '../helpers/regulatedFeatures'
const mobileUrl = process.env.MOBILE_WEB_URL
test.skip(!mobileUrl, 'Requires Expo web at MOBILE_WEB_URL')

const base = { id: '507f1f77bcf86cd799439121', email: 'card@rentos.test', firstName: 'Kwesi', lastName: 'Card', phone: '0241234567', roles: ['landlord'], activeRole: 'landlord' }

/** Opens Settings > Profile with GET /users/me answering `account`; PATCH /users/me answers with `respond`. */
async function openProfileSettings(page: Page, account: Record<string, unknown>, respond: (body: Record<string, unknown>) => { status: number; data?: Record<string, unknown>; error?: string }) {
  const patches: Record<string, unknown>[] = []
  let current = { ...account }
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/users/me' && request.method() === 'PATCH') {
      const body = request.postDataJSON() as Record<string, unknown>
      patches.push(body)
      const answer = respond(body)
      if (answer.status >= 400) { await route.fulfill({ status: answer.status, json: { success: false, error: answer.error } }); return }
      current = { ...current, ...answer.data }
      await route.fulfill({ json: { success: true, data: current } })
      return
    }
    let data: unknown = { items: [], total: 0 }
    // The login payload carries no card: the screen must read it from /users/me.
    if (path === '/api/auth/login') data = { user: base, token: 'card-token', refreshToken: 'card-refresh' }
    else if (path === '/api/users/me') data = current
    else if (path === '/api/chat/unread-count') data = { count: 0 }
    else if (path === '/api/platform/features') data = allRegulatedFeatures
    await route.fulfill({ json: { success: true, data } })
  })
  await page.goto(`${mobileUrl}/auth/login`)
  await page.getByPlaceholder('you@example.com').fill(base.email)
  await page.getByPlaceholder('Enter your password').fill('E2e!Password123')
  await page.getByText('Sign in', { exact: true }).click()
  await page.getByText('Profile', { exact: true }).last().click()
  await page.getByText('Edit Profile', { exact: true }).click()
  return patches
}

test('a saved card is shown masked and can be replaced, with the review reset explained', async ({ page }) => {
  const patches = await openProfileSettings(page, { ...base, ghanaCardId: 'GHA-123456789-0', isVerified: true, verificationStatus: 'verified' },
    (body) => ({ status: 200, data: { ghanaCardId: body.ghanaCardId as string, isVerified: false, verificationStatus: 'none' } }))
  await expect(page.getByLabel('Saved Ghana Card ending 7890')).toHaveText('GHA-•••••7890')
  await expect(page.getByText('GHA-123456789-0')).toHaveCount(0)
  await expect(page.getByText('Changing your name or Ghana Card resets your ID review until RentOS reviews it again.', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Replace Ghana Card' }).click()
  const input = page.getByLabel('New Ghana Card ID')
  await input.fill('GHA-12345')
  await page.getByText('Save Profile', { exact: true }).click()
  await expect(page.getByText('Enter your Ghana Card ID as GHA-123456789-0.', { exact: true })).toBeVisible()
  expect(patches).toEqual([])

  await input.fill('gha-987654321-5')
  await page.getByText('Save Profile', { exact: true }).click()
  await expect(page.getByText('Profile updated. Your ID review was reset, so request a new one when you are ready.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Saved Ghana Card ending 3215')).toBeVisible()
  expect(patches).toEqual([{ firstName: base.firstName, lastName: base.lastName, phone: base.phone, ghanaCardId: 'GHA-987654321-5' }])
})

test('a saved card can be removed explicitly after confirming', async ({ page }) => {
  const patches = await openProfileSettings(page, { ...base, ghanaCardId: 'GHA-123456789-0', isVerified: false, verificationStatus: 'pending' },
    () => ({ status: 200, data: { ghanaCardId: undefined, isVerified: false, verificationStatus: 'none' } }))
  await page.getByRole('button', { name: 'Remove Ghana Card' }).click()
  await expect(page.getByText('Remove GHA-•••••7890 from your profile? This resets your ID review.', { exact: true })).toBeVisible()
  await page.getByText('Keep it', { exact: true }).click()
  await expect(page.getByLabel('Saved Ghana Card ending 7890')).toBeVisible()
  expect(patches).toEqual([])

  await page.getByRole('button', { name: 'Remove Ghana Card' }).click()
  await page.getByRole('button', { name: 'Confirm remove Ghana Card' }).click()
  await expect(page.getByText('Your Ghana Card was removed from your profile. Your ID review was reset, so request a new one when you are ready.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Ghana Card ID', { exact: true })).toBeVisible()
  expect(patches).toEqual([{ ghanaCardId: null }])
})

test('with no card on file the field starts empty and saving without one leaves it untouched', async ({ page }) => {
  const patches = await openProfileSettings(page, { ...base, isVerified: false, verificationStatus: 'none' }, () => ({ status: 200, data: {} }))
  await expect(page.getByLabel('Ghana Card ID', { exact: true })).toHaveValue('')
  await expect(page.getByText(/resets your ID review/)).toHaveCount(0)
  await page.getByText('Save Profile', { exact: true }).click()
  await expect(page.getByText('Profile updated.', { exact: true })).toBeVisible()
  expect(patches).toEqual([{ firstName: base.firstName, lastName: base.lastName, phone: base.phone }])
})

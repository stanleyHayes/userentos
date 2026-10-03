import { test, expect, loginViaUI, TENANT_USER } from '../fixtures/auth'

async function accessToken(page: Parameters<typeof loginViaUI>[0]): Promise<string> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('rentos-auth')
    if (!raw) throw new Error('Missing persisted RentOS auth state')
    const parsed = JSON.parse(raw) as {
      state?: { token?: string; accessToken?: string }
    }
    const token = parsed.state?.token ?? parsed.state?.accessToken
    if (!token) throw new Error('Missing access token in persisted RentOS auth state')
    return token
  })
}

test.describe('role capabilities release gate', () => {
  test('public developments page and API are available without authentication', async ({ page }) => {
    const response = await page.request.get('/api/capabilities/developer/offplan')
    expect(response.status()).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { items: expect.any(Array) },
    })

    await page.goto('/developments')
    await expect(page.getByRole('heading', { name: 'Off-plan developments' })).toBeVisible()
    await expect(
      page.getByText(/No developments published|Starting at GHS/).first()
    ).toBeVisible()
  })

  test('workflow ledger rejects unauthenticated requests', async ({ request }) => {
    const response = await request.get('/api/capabilities/workflows')
    expect(response.status()).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
    })
  })

  test('developer market analytics reject a tenant role', async ({ page }) => {
    await loginViaUI(page, TENANT_USER)
    const token = await accessToken(page)
    const response = await page.request.get('/api/capabilities/developer/market', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(response.status()).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
    })
  })

  test('developer tools are for developers: a landlord sees no developer profile and the API refuses one', async ({
    authedLandlordPage: page,
  }) => {
    // Developer profiles and off-plan listings belong to developer accounts (capabilityLogic.ts).
    await page.goto('/role-capabilities')
    await expect(page.getByRole('heading', { name: 'Role Capabilities' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Developer profile' })).toHaveCount(0)

    const token = await accessToken(page)
    const response = await page.request.post('/api/capabilities/workflows', {
      headers: { Authorization: `Bearer ${token}` },
      data: { kind: 'developer_profile' },
    })
    expect(response.status()).toBe(403)
  })
})

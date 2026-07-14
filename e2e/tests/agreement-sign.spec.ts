import { test, expect } from '../fixtures/auth'

// API base URL — defaults to the CI/dev port; override with E2E_API_URL when
// the local API runs on a different port.
const API_BASE = process.env.E2E_API_URL || 'http://localhost:3002'

/**
 * Tenant views an agreement and signs it.
 *
 * To stay isolated from other test runs, the test creates a fresh draft
 * agreement via API (as the landlord), has the landlord sign it, and then
 * uses the UI to sign as the tenant.
 */
test.describe('agreement signing', () => {
  test('tenant can open and sign a pending agreement', async ({ authedPage: page, request }) => {
    // ── 1. Read Kwame's userId from the JWT stored in localStorage ──
    const kwameId = await page.evaluate(() => {
      const raw = localStorage.getItem('rentos-auth')
      if (!raw) return null
      const parsed = JSON.parse(raw)
      const token = parsed.state?.token
      if (!token) return null
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        return payload.userId ?? null
      } catch {
        return null
      }
    })
    if (!kwameId) throw new Error('Could not read Kwame userId from localStorage JWT')

    // ── 2. Log in as landlord (yaw@rentos.gh) via API ──
    const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
      data: { email: 'yaw@rentos.gh', password: 'password123' },
    })
    const loginData = await loginRes.json()
    const landlordToken: string = loginData.data.token

    // ── 3. Get one of yaw's properties ──
    const propsRes = await request.get(`${API_BASE}/api/properties`, {
      headers: { Authorization: `Bearer ${landlordToken}` },
    })
    const propsData = await propsRes.json()
    const propertyId: string = propsData.data.items[0]?.id
    if (!propertyId) throw new Error('No property found for landlord')

    // ── 4. Create a draft agreement for Kwame ──
    const createRes = await request.post(`${API_BASE}/api/agreements`, {
      headers: { Authorization: `Bearer ${landlordToken}` },
      data: {
        propertyId,
        tenantId: kwameId,
        startDate: '2026-06-01',
        endDate: '2027-06-01',
        rentAmount: 2000,
        securityDeposit: 1000,
        advanceMonths: 2,
        terms: ['E2E test agreement terms'],
      },
    })
    const createData = await createRes.json()
    const agreementId: string = createData.data.id

    // ── 5. Landlord signs the agreement → status becomes pending_signatures ──
    await request.post(`${API_BASE}/api/agreements/${agreementId}/sign`, {
      headers: { Authorization: `Bearer ${landlordToken}` },
    })

    // ── 6. UI: tenant signs the agreement ──
    await page.goto('/agreements')

    // Pick an agreement row that needs signing (has 'Sign' badge).
    const row = page.getByTestId('agreement-row').filter({ has: page.getByTestId('agreement-needs-sign') }).first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.click()
    await expect(page).toHaveURL(/\/agreements\/[a-f0-9]+/i)

    // Sign.
    await page.getByTestId('agreement-sign-button').click()
    const pad = page.getByTestId('signature-pad')
    await expect(pad).toBeVisible()

    // The implementation may use a canvas, an OTP, or a type-your-name
    // field — fill the most generic case (a textbox) and let component
    // tests cover the canvas variant separately.
    const textbox = pad.getByRole('textbox').first()
    if (await textbox.isVisible().catch(() => false)) {
      await textbox.fill('Kwame Asante')
    }

    await page.getByTestId('signature-confirm').click()
    await expect(page.getByTestId('agreement-signed-badge')).toBeVisible({ timeout: 15_000 })
  })
})

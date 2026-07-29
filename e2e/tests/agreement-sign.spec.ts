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

    // ── 2. Create an isolated landlord for this run ──
    // Reusing a seeded landlord gradually consumes every available property as
    // repeated local runs activate agreements. A unique account/property keeps
    // the test repeatable without mutating fixture inventory.
    const suffix = Date.now().toString()
    const registerRes = await request.post(`${API_BASE}/api/auth/register`, {
      data: {
        email: `e2e-landlord-${suffix}@rentos.test`,
        phone: `024${suffix.slice(-7)}`,
        password: 'E2e!Password123',
        firstName: 'E2E',
        lastName: 'Landlord',
        role: 'landlord',
      },
    })
    const registerData = await registerRes.json()
    expect(registerRes.ok(), `Landlord registration failed: ${JSON.stringify(registerData)}`).toBeTruthy()
    const landlordToken: string = registerData.data.token

    // ── 3. Create a dedicated available property ──
    const propertyRes = await request.post(`${API_BASE}/api/properties`, {
      headers: { Authorization: `Bearer ${landlordToken}` },
      data: {
        title: `E2E agreement property ${suffix}`,
        description: 'Isolated property used by the agreement signing release test.',
        type: 'apartment',
        address: { street: '1 E2E Lane', city: 'Accra', region: 'Greater Accra' },
        rentAmount: 2000,
        rentDurationMonths: 12,
        advanceMonths: 2,
        rules: [],
        amenities: [],
      },
    })
    const propertyData = await propertyRes.json()
    expect(propertyRes.ok(), `Property creation failed: ${JSON.stringify(propertyData)}`).toBeTruthy()
    const propertyId: string = propertyData.data.id

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
    expect(createRes.ok(), `Agreement creation failed: ${JSON.stringify(createData)}`).toBeTruthy()
    const agreementId: string = createData.data.id

    // ── 5. Landlord signs the agreement → status becomes pending_signatures ──
    // The server records the typed legal name as the e-signature.
    await request.post(`${API_BASE}/api/agreements/${agreementId}/sign`, {
      headers: { Authorization: `Bearer ${landlordToken}` },
      data: { signatureName: 'Yaw Osei' },
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

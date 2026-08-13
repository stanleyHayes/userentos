import { test, expect } from '../fixtures/auth'

// API base URL — defaults to the CI/dev port; override with E2E_API_URL when
// the local API runs on a different port.
const API_BASE = process.env.E2E_API_URL || 'http://localhost:3002'
const ADMIN = { email: 'admin@rentos.gh', password: 'password123' }

/**
 * Tenant submits a rental application against a property.
 *
 * To stay isolated from seed inventory (repeated runs consume every available
 * property), the test provisions its own landlord + property via API, publishes
 * and admin-approves the listing, then uses the UI to apply as the tenant.
 *
 * Requires test ids:
 *   - data-testid="property-card"            on each card on /properties
 *   - data-testid="property-apply-button"    on the CTA inside PropertyDetailPage
 *   - data-testid="application-form"         the form root
 *   - data-testid="application-submit"       the submit button
 *   - data-testid="application-success"      success banner / toast container
 */
test.describe('property application', () => {
  test('tenant can browse properties and submit an application', async ({ authedPage: page, request }) => {
    // ── 1. Register an isolated landlord for this run ──
    const suffix = Date.now().toString()
    const registerRes = await request.post(`${API_BASE}/api/auth/register`, {
      data: {
        email: `e2e-apply-landlord-${suffix}@rentos.test`,
        phone: `024${suffix.slice(-7)}`,
        password: 'E2e!Password123',
        firstName: 'E2E',
        lastName: 'ApplyLandlord',
        role: 'landlord',
      },
    })
    const registerData = await registerRes.json()
    expect(registerRes.ok(), `Landlord registration failed: ${JSON.stringify(registerData)}`).toBeTruthy()
    const landlordToken: string = registerData.data.token

    // ── 2. Create, publish, and admin-approve a dedicated property ──
    const propertyRes = await request.post(`${API_BASE}/api/properties`, {
      headers: { Authorization: `Bearer ${landlordToken}` },
      data: {
        title: `E2E apply property ${suffix}`,
        description: 'Isolated property used by the application release test.',
        type: 'apartment',
        address: { street: '1 E2E Lane', city: 'Accra', region: 'Greater Accra' },
        rentAmount: 1500,
        rentDurationMonths: 12,
        advanceMonths: 2,
        rules: [],
        amenities: [],
      },
    })
    const propertyData = await propertyRes.json()
    expect(propertyRes.ok(), `Property creation failed: ${JSON.stringify(propertyData)}`).toBeTruthy()
    const propertyId: string = propertyData.data.id

    const publishRes = await request.post(`${API_BASE}/api/properties/${propertyId}/publish`, {
      headers: { Authorization: `Bearer ${landlordToken}` },
    })
    expect(publishRes.ok(), `Property publish failed: ${JSON.stringify(await publishRes.json())}`).toBeTruthy()

    const adminLoginRes = await request.post(`${API_BASE}/api/auth/login`, { data: ADMIN })
    const adminLoginData = await adminLoginRes.json()
    expect(adminLoginRes.ok(), `Admin login failed: ${JSON.stringify(adminLoginData)}`).toBeTruthy()

    const reviewRes = await request.post(`${API_BASE}/api/properties/${propertyId}/review`, {
      headers: { Authorization: `Bearer ${adminLoginData.data.token}` },
      data: { status: 'approved' },
    })
    expect(reviewRes.ok(), `Listing approval failed: ${JSON.stringify(await reviewRes.json())}`).toBeTruthy()

    // ── 3. UI: browse the marketplace, then open the new listing ──
    await page.goto('/properties')
    await expect(page).toHaveURL(/\/properties/)
    await expect(page.getByTestId('property-card').first()).toBeVisible({ timeout: 15_000 })

    // The freshly approved listing sorts newest-first; navigate directly to
    // its detail page rather than depending on pagination position.
    await page.goto(`/properties/${propertyId}`)
    await expect(page).toHaveURL(new RegExp(`/properties/${propertyId}`))
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })

    // ── 4. Submit the application ──
    await page.getByTestId('property-apply-button').click()
    const form = page.getByTestId('application-form')
    await expect(form).toBeVisible()

    await form.getByRole('textbox').first().fill('I would love to rent this property.')
    await page.getByTestId('application-submit').click()

    // If the tenant has an active lease, a validation message appears inside the
    // form instead of the success banner. Both outcomes are acceptable for this
    // E2E smoke test — we just verify the form submission produces a deterministic
    // UI response.
    const successBanner = page.getByTestId('application-success')
    const validationMessage = page.getByText(/active lease|non-renewal|expires soon/i)
    await expect(successBanner.or(validationMessage).first()).toBeVisible({ timeout: 15_000 })
  })
})

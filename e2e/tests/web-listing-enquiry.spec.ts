import { test, expect, type Page } from '@playwright/test'
import { signInWithMockedApi, type MockHandler } from '../helpers/mockedWeb'

// Runs against a Vite dev server with every API response mocked:
//   PLAYWRIGHT_BASE_URL=http://localhost:5602 npx playwright test -c playwright.web-mocked.config.ts
test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'Requires a web dev server at PLAYWRIGHT_BASE_URL')

const tenant = { id: '507f1f77bcf86cd799439701', email: 'tenant@rentos.test', firstName: 'Ama', lastName: 'Tenant', phone: '0241234567', roles: ['tenant'], activeRole: 'tenant' }
const property = {
  id: 'prop-1', title: 'Bright flat in Osu', description: 'Two bedrooms near the market.', type: 'apartment', listingType: 'rent', listingStatus: 'published', status: 'available',
  address: { street: '1 Oxford St', city: 'Accra', region: 'Greater Accra', neighborhood: 'Osu' }, rentAmount: 2500, rentDurationMonths: 12, advanceMonths: 6,
  bedrooms: 2, bathrooms: 1, images: [], amenities: [], rules: [], landlordId: '507f1f77bcf86cd799439799',
}

/** The listing page with "Message on RentOS" open (as the public page's button sends it). */
async function openMessage(page: Page, enquiry: MockHandler) {
  await signInWithMockedApi(page, tenant, (request) => {
    if (request.method === 'GET' && request.path === '/properties/prop-1') return { data: property }
    return enquiry(request)
  })
  await page.goto('/properties/prop-1?contact=1')
  await expect(page.getByRole('heading', { name: 'Message on RentOS' })).toBeVisible({ timeout: 20_000 })
}

test('"Message on RentOS" sends the typed message as an enquiry and opens the conversation', async ({ page }) => {
  let sent: unknown = null
  await openMessage(page, ({ method, path, body }) => {
    if (method === 'POST' && path === '/agent/leads/property/prop-1') { sent = body; return { status: 201, data: { id: 'lead-1', conversationId: 'conv-1' } } }
    return undefined
  })
  await page.getByRole('dialog').getByRole('textbox', { name: 'Message' }).fill('Is it still available from November?')
  await page.getByRole('dialog').getByRole('button', { name: 'Send' }).click()
  await expect(page).toHaveURL(/\/messages\?conversationId=conv-1$/, { timeout: 20_000 })
  expect(sent).toEqual({ message: 'Is it still available from November?' })
})

test('a message stopped for sharing contact details keeps its text and says why', async ({ page }) => {
  await openMessage(page, ({ method, path }) => (
    method === 'POST' && path === '/agent/leads/property/prop-1'
      ? { status: 422, error: 'This message was not sent: it shares contact details.', extra: { blocked: true, reason: 'OFF_PLATFORM_CONTACT', decisionId: 'dec-1' } }
      : undefined
  ))
  await page.getByRole('dialog').getByRole('textbox', { name: 'Message' }).fill('Call me on 024 123 4567')
  await page.getByRole('dialog').getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText(/not sent|contact details/i).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Message' })).toHaveValue('Call me on 024 123 4567')
  await expect(page).toHaveURL(/\/properties\/prop-1/)
})

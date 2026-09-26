import { test, expect, type Page } from '@playwright/test'
import { allRegulatedFeatures } from '../helpers/regulatedFeatures'

// The mobile share sheet links https://userentos.com/registry/<id>
// (apps/mobile/lib/listingShare.ts). Signed out, that page must render the
// listing. Runs against a Vite dev server with the API mocked:
//   PLAYWRIGHT_BASE_URL=http://localhost:5602 npx playwright test -c playwright.web-mocked.config.ts
test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'Requires a web dev server at PLAYWRIGHT_BASE_URL')

const id = '507f1f77bcf86cd799439181'
const listing = {
  id, title: 'Two-bedroom flat in Osu', city: 'Accra', region: 'Greater Accra', digitalAddress: '', neighborhood: 'Osu',
  propertyType: 'apartment', rentAmount: 2500, bedrooms: 2, bathrooms: 1, listingStatus: 'approved', publishedAt: null, image: null,
  landlordIdentityVerified: false,
}

/** No stored session; the listing endpoint answers `detail`, everything else an empty result. */
async function signedOut(page: Page, detail: { status: number; data?: unknown }) {
  const requested: string[] = []
  await page.route('**/socket.io/**', route => route.abort())
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    requested.push(path)
    if (path === `/api/public/properties/${id}`) {
      return route.fulfill({ status: detail.status, json: detail.status < 400 ? { success: true, data: detail.data } : { success: false, error: 'Property not found' } })
    }
    const data = path === '/api/platform/features' ? allRegulatedFeatures : path === '/api/public/properties/track' ? null : { items: [], total: 0 }
    return route.fulfill({ json: { success: true, data } })
  })
  return requested
}

test('a shared listing link opens the public page while signed out', async ({ page }) => {
  const requested = await signedOut(page, { status: 200, data: listing })
  await page.goto(`/registry/${id}`)
  await expect(page.getByRole('heading', { name: listing.title })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Reviewed listing on RentOS', { exact: true })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe(`/registry/${id}`)
  expect(requested).toContain(`/api/public/properties/${id}`)
})

test('a listing that is no longer public shows not found instead of the sign-in page', async ({ page }) => {
  await signedOut(page, { status: 404 })
  await page.goto(`/registry/${id}`)
  await expect(page.getByRole('heading', { name: 'Property not found' })).toBeVisible({ timeout: 20_000 })
  expect(new URL(page.url()).pathname).toBe(`/registry/${id}`)
})

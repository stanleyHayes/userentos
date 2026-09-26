import { test, expect } from '@playwright/test'
import { signInWithMockedApi } from '../helpers/mockedWeb'

// Runs against a Vite dev server with every API response mocked:
//   PLAYWRIGHT_BASE_URL=http://localhost:5602 npx playwright test -c playwright.web-mocked.config.ts
test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'Requires a web dev server at PLAYWRIGHT_BASE_URL')

const tenant = { id: '507f1f77bcf86cd799439201', email: 'ama@rentos.test', firstName: 'Ama', lastName: 'Tenant', phone: '0241234567', roles: ['tenant'], activeRole: 'tenant' }
// The shape GET /documents actually returns: `type` from the model enum,
// `fileUrl` and `ownerId` — no `category`, `url` or `userId`.
const doc = (id: string, name: string, type: string, ownerId: string) => ({
  id, _id: id, ownerId, name, type, mimeType: 'application/pdf', fileUrl: `https://res.cloudinary.test/${id}.pdf`, fileSize: 2048,
  version: 1, accessControl: [ownerId], createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:00:00.000Z',
})

test('documents list, search and upload use the server document types', async ({ page }) => {
  const documents = [doc('lease-1', 'Tenancy 2026', 'rental_agreement', tenant.id), doc('receipt-1', 'March rent', 'receipt', '507f1f77bcf86cd799439202')]
  const uploads: string[] = []
  await signInWithMockedApi(page, tenant, ({ method, path, body }) => {
    if (method === 'GET' && path === '/documents') return { data: { items: documents, total: documents.length } }
    if (method === 'POST' && path === '/documents') {
      uploads.push(String(body))
      return { status: 201, data: doc('new-1', 'Inspection', 'evidence', tenant.id) }
    }
    return undefined
  })
  await page.goto('/documents')

  await expect(page.getByRole('heading', { name: 'Tenancy 2026' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Lease Agreement', { exact: true })).toBeVisible()
  await expect(page.locator('a[href="https://res.cloudinary.test/lease-1.pdf"]')).toHaveCount(1)
  // Delete is offered on the document this user owns, not the shared one.
  await expect(page.locator('button.text-danger')).toHaveCount(1)

  // Searching by category label used to crash the page on undefined.toLowerCase().
  const search = page.getByPlaceholder('Search documents...')
  await search.fill('lease')
  await expect(page.getByText('1 document found')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tenancy 2026' })).toBeVisible()
  await search.fill('no such document')
  await expect(page.getByText('No documents match your search')).toBeVisible()
  await search.fill('')

  await page.getByRole('button', { name: 'Upload', exact: true }).click()
  await page.locator('input[type="file"]').setInputFiles({ name: 'inspection.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') })
  await page.getByLabel('Document Name').fill('Move-in inspection')
  await page.getByRole('combobox', { name: 'Category' }).click()
  await page.getByRole('option', { name: 'Inspection Report / Evidence' }).click()
  await page.getByRole('button', { name: 'Upload Document' }).click()
  await expect.poll(() => uploads.length).toBe(1)
  expect(uploads[0]).toMatch(/name="type"\r\n\r\nevidence\r\n/)
})

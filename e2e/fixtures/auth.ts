import { test as base, expect, type Page } from '@playwright/test'

/**
 * Default seeded tenant credentials. The server's `seedDatabase()` provisions
 * this user on first boot — see `server/src/models/seed.ts`. All seed accounts
 * share the password `password123`.
 *
 * If your environment doesn't auto-seed (e.g. you're pointing at a clean
 * database or a non-dev environment) override these via env vars before
 * running Playwright:
 *
 *     E2E_TENANT_EMAIL=tenant@rentos.gh \
 *     E2E_TENANT_PASSWORD=password123 \
 *     npm test
 */
export const TENANT_USER = {
  email: process.env.E2E_TENANT_EMAIL || 'kwame@rentos.gh',
  password: process.env.E2E_TENANT_PASSWORD || 'password123',
} as const

export const LANDLORD_USER = {
  email: process.env.E2E_LANDLORD_EMAIL || 'yaw@rentos.gh',
  password: process.env.E2E_LANDLORD_PASSWORD || 'password123',
} as const

/**
 * Perform a UI login flow against /login and assert the dashboard renders.
 * Reusable from any test file.
 */
export async function loginViaUI(
  page: Page,
  user: { email: string; password: string } = TENANT_USER
): Promise<void> {
  await page.goto('/login')

  // The LoginPage uses MUI TextField with id="email" and a PasswordInput with
  // id="password". Selecting by id is the most stable target until shared
  // data-testids land.
  await page.locator('#email').fill(user.email)
  await page.locator('#password').fill(user.password)

  await Promise.all([
    page.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 30_000 }),
    page.getByRole('button', { name: /sign in|log ?in|continue/i }).click(),
  ])

  // Sanity check: localStorage should now contain the persisted auth blob
  // written by zustand (`rentos-auth`).
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('rentos-auth')), {
      timeout: 5_000,
    })
    .not.toBeNull()

  // Dismiss onboarding tour if it appears (first-login experience).
  // The tour modal fades in after a short delay; wait for it then skip.
  const skipTour = page.getByRole('button', { name: /skip tour/i })
  try {
    await skipTour.waitFor({ state: 'visible', timeout: 3_000 })
    await skipTour.click()
  } catch {
    // Tour did not appear — okay to continue.
  }
}

type AuthFixtures = {
  /** A page that has already completed the tenant login flow. */
  authedPage: Page
  /** A page that has already completed the landlord login flow. */
  authedLandlordPage: Page
}

/**
 * Extended Playwright `test` with an `authedPage` fixture. Use this in any
 * spec that needs to start from a logged-in state:
 *
 *     import { test, expect } from '../fixtures/auth'
 *     test('does a thing', async ({ authedPage }) => { ... })
 */
export const test = base.extend<AuthFixtures>({
  authedPage: async ({ page }, use) => {
    await loginViaUI(page, TENANT_USER)
    await use(page)
  },
  authedLandlordPage: async ({ page }, use) => {
    await loginViaUI(page, LANDLORD_USER)
    await use(page)
  },
})

export { expect }

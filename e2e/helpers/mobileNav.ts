import type { Page } from '@playwright/test'

/** Open a screen by its path, as a deep link or a notification tap does. */
export async function openScreen(page: Page, path: string) {
  await page.evaluate((to) => { window.history.pushState({}, '', to); window.dispatchEvent(new PopStateEvent('popstate')) }, path)
}

/*
 * Workers, My Bookings and Local Services are paused for tenants, agents and
 * landlords in this phase: their Profile entries are hidden, but the screens
 * still open by link. Until the journey switches let a test turn them on,
 * specs of those screens open them by path.
 */
const PAUSED_SCREENS: Readonly<Record<string, string>> = {
  'Local Services': '/local-services',
  'Find Workers': '/workers',
  'My Bookings': '/bookings',
  'Become a Worker': '/become-worker',
}

/** Open a Profile menu entry, or the paused screen it names by path. */
export async function openProfileEntry(page: Page, label: string) {
  await page.getByText('Profile', { exact: true }).last().click()
  const paused = PAUSED_SCREENS[label]
  if (paused) await openScreen(page, paused)
  else await page.getByText(label, { exact: true }).click()
}

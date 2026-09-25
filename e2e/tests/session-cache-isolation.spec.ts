import { test, expect } from '../fixtures/auth'
import { allRegulatedFeatures } from '../helpers/regulatedFeatures'

for (const transition of ['same account', 'different account', 'role change']) test(`fresh login to ${transition} hides cached wallet data until reloaded`, async ({ authedPage: page }) => {
  let user = await page.evaluate(() => JSON.parse(localStorage.getItem('rentos-auth')!).state.user)
  if (transition === 'role change') user = { ...user, roles: ['tenant', 'landlord'] }
  let changed = false
  let reloads = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/**', route => route.fulfill({ json: { data: { items: [], total: 0 } } }))
  await page.route('**/api/users/me', route => route.fulfill({ json: { data: user } }))
  await page.route('**/api/platform/features', route => route.fulfill({ json: { data: allRegulatedFeatures } }))
  await page.route('**/api/savings/wallet', async route => {
    if (changed) { reloads++; await gate }
    return route.fulfill({ json: { data: { balance: changed ? 200 : 100, transactions: [{ id: 'fixture-transaction', amount: 5, type: 'credit', description: changed ? 'Current session transaction' : 'Previous session private transaction', createdAt: '2026-09-01T00:00:00Z' }] } } })
  })
  if (transition === 'role change') await page.evaluate(async user => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/stores/authStore.ts')!
    const { useAuthStore } = await import(path)
    useAuthStore.getState().updateUser(user)
  }, user)
  await page.goto('/savings')
  await expect(page.getByText('Previous session private transaction', { exact: true })).toBeVisible()
  changed = true
  if (transition === 'different account') user = { ...user, id: 'replacement-owner' }
  if (transition === 'role change') user = { ...user, activeRole: 'landlord' }
  await page.evaluate(async ({ user, transition }) => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/stores/authStore.ts')!
    const { useAuthStore } = await import(path)
    if (transition === 'role change') useAuthStore.getState().switchRole('landlord')
    else useAuthStore.getState().login(user, 'replacement-token', 'replacement-refresh')
  }, { user, transition })
  await expect(page.getByText('Previous session private transaction', { exact: true })).toHaveCount(0)
  await expect.poll(() => reloads).toBeGreaterThan(0)
  release()
  await expect(page.getByText('Current session transaction', { exact: true })).toBeVisible()
})

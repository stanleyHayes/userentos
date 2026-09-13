import { test, expect } from '../fixtures/auth'

test('legacy notifications render once on public pages and errors remain until dismissed', async ({ page }) => {
  await page.goto('/login')
  await page.clock.install()
  await page.evaluate(async () => {
    const path = '/src/stores/toastStore.ts'
    const { useToastStore } = await import(/* @vite-ignore */ path)
    useToastStore.getState().addToast('Persistent fixture error', 'error')
  })
  await expect(page.getByRole('alert')).toHaveText('Persistent fixture error')
  await expect(page.getByText('Persistent fixture error', { exact: true })).toHaveCount(1)
  await page.clock.fastForward(10_000)
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Dismiss notification' }).click()
  await page.clock.fastForward(1500)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('payout verification displays a direct-library success notification once', async ({ authedPage: page }) => {
  let saved = false
  const account = { type: 'mobile_money', bankCode: 'FIX', bankName: 'Fixture network', accountNumber: '0241234567', accountName: 'Confirmed fixture owner', verified: true }
  await page.route('**/api/payouts/account', route => {
    if (route.request().method() === 'PUT') saved = true
    return route.fulfill({ json: { data: saved ? account : null } })
  })
  await page.route('**/api/payouts/destinations', route => route.fulfill({ json: { data: { items: [{ type: 'mobile_money', code: 'FIX', name: 'Fixture network' }] } } }))
  await page.goto('/settings?tab=payouts')
  await page.getByLabel('Network', { exact: true }).click()
  await page.getByRole('option', { name: 'Fixture network' }).click()
  await page.getByLabel('Mobile money number', { exact: true }).fill('0241234567')
  await page.getByLabel('Account name', { exact: true }).fill('Entered owner')
  await page.getByRole('button', { name: 'Verify and save', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Verified as Confirmed fixture owner')
  await expect(page.getByText('Verified as Confirmed fixture owner', { exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: 'Dismiss notification' }).click()
  await expect(page.getByText('Verified as Confirmed fixture owner', { exact: true })).toHaveCount(0)
})

for (const transition of ['logout', 'replacement', 'same-user login']) test(`notifications are cleared on ${transition} while token/profile updates preserve them`, async ({ authedPage: page }) => {
  await page.goto('/settings')
  await page.evaluate(async () => {
    const path = '/src/stores/toastStore.ts'
    const { useToastStore } = await import(/* @vite-ignore */ path)
    useToastStore.getState().addToast('Previous session private error', 'error')
  })
  await expect(page.getByRole('alert')).toHaveText('Previous session private error')
  await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/stores/authStore.ts')!
    if (!path) throw new Error('Loaded auth module not found')
    const { useAuthStore } = await import(/* @vite-ignore */ path)
    useAuthStore.setState({ token: useAuthStore.getState().token + '-rotated' })
    useAuthStore.getState().updateUser({ firstName: 'Updated' })
  })
  await expect(page.getByRole('alert')).toHaveText('Previous session private error')
  await page.evaluate(async transition => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/stores/authStore.ts')!
    if (!path) throw new Error('Loaded auth module not found')
    const { useAuthStore } = await import(/* @vite-ignore */ path)
    const state = useAuthStore.getState()
    if (transition === 'logout') state.logout()
    else if (transition === 'replacement') useAuthStore.setState({ user: { ...state.user, id: 'replacement-owner' } })
    else state.login(state.user, state.token, state.refreshToken)
  }, transition)
  await expect(page.getByText('Previous session private error', { exact: true })).toHaveCount(0)
})

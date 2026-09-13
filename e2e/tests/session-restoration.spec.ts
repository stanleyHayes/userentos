import { test, expect } from '../fixtures/auth'

for (const transition of ['logout', 'replacement', 'same-user login', 'unchanged']) test(`restoration refresh respects ${transition}`, async ({ authedPage: page }) => {
  const initial = await page.evaluate(() => JSON.parse(localStorage.getItem('rentos-auth')!).state)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let refreshing = false
  let refreshCount = 0
  let apiRequests = 0
  await page.route('**/api/**', route => route.fulfill({ json: { data: { items: [], total: 0 } } }))
  await page.route('**/api/users/me', route => route.fulfill(route.request().headers().authorization === 'Bearer expired-fixture' ? { status: 401, json: { error: 'Expired' } } : { json: { data: initial.user } }))
  await page.route('**/api/auth/refresh', async route => {
    refreshing = true
    refreshCount++
    await gate
    await route.fulfill({ json: { data: { token: 'old-session-refreshed', refreshToken: 'old-session-rotated' } } })
  })
  await page.addInitScript(initial => localStorage.setItem('rentos-auth', JSON.stringify({ state: { ...initial, token: 'expired-fixture', refreshToken: 'original-refresh' }, version: 0 })), initial)
  await page.reload()
  await expect.poll(() => refreshing).toBe(true)
  let concurrentApi: Promise<unknown> | undefined
  if (transition === 'unchanged') {
    await page.route('**/api/concurrent-session-check', route => {
      apiRequests++
      return route.fulfill(apiRequests === 1 ? { status: 401 } : { json: { data: 'shared refresh result' } })
    })
    concurrentApi = page.evaluate(async () => {
      const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/lib/api.ts')!
      const { api } = await import(path)
      return api.get('/concurrent-session-check')
    })
    await expect.poll(() => apiRequests).toBe(1)
  }
  await page.evaluate(async transition => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/stores/authStore.ts')!
    if (!path) throw new Error('Loaded auth module not found')
    const { useAuthStore } = await import(/* @vite-ignore */ path)
    const state = useAuthStore.getState()
    if (transition === 'logout') state.logout()
    if (transition === 'replacement') state.login({ ...state.user, id: 'replacement-owner' }, 'replacement-token', 'replacement-refresh')
    if (transition === 'same-user login') state.login(state.user, 'replacement-token', 'replacement-refresh')
  }, transition)
  const response = page.waitForResponse('**/api/auth/refresh')
  release()
  await response
  // Wait for the response body and React/store continuations to run.
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)))
  const result = await page.evaluate(() => JSON.parse(localStorage.getItem('rentos-auth')!).state)
  if (transition === 'logout') { expect(result.token).toBeNull(); expect(result.isAuthenticated).toBe(false) }
  else if (transition === 'unchanged') {
    await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('rentos-auth')!).state.token)).toBe('old-session-refreshed')
    expect(result.user.id).toBe(initial.user.id)
    expect(await concurrentApi).toBe('shared refresh result')
    expect(refreshCount).toBe(1)
    expect(apiRequests).toBe(2)
  } else { expect(result.token).toBe('replacement-token'); expect(result.refreshToken).toBe('replacement-refresh') }
})

test('restoration server outage does not log out a persisted account', async ({ authedPage: page }) => {
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('rentos-auth')!).state)
  await page.route('**/api/users/me', route => route.fulfill({ status: 503, json: { error: 'Temporarily unavailable' } }))
  const response = page.waitForResponse('**/api/users/me')
  await page.reload()
  await response
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)))
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('rentos-auth')!).state)
  expect(after.isAuthenticated).toBe(true)
  expect(after.token).toBe(before.token)
  expect(after.user.id).toBe(before.user.id)
})

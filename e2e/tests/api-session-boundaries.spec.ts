import { test, expect } from '../fixtures/auth'

for (const kind of ['json', 'upload']) for (const status of [200, 401]) test(`${kind} ${status} from an earlier same-account session is discarded`, async ({ authedPage: page }) => {
  await page.goto('/settings')
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let requests = 0, refreshes = 0
  let contentType = ''
  await page.route('**/api/session-fixture', async route => {
    requests++; contentType = route.request().headers()['content-type'] ?? ''
    await gate
    return route.fulfill({ status, json: status === 200 ? { data: { secret: 'old session' } } : { error: 'Expired' } })
  })
  await page.route('**/api/auth/refresh', route => { refreshes++; return route.fulfill({ status: 503 }) })
  const outcome = page.evaluate(async kind => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/lib/api.ts')!
    const { api } = await import(/* @vite-ignore */ path)
    try {
      if (kind === 'upload') { const body = new FormData(); body.append('file', new Blob(['fixture']), 'fixture.txt'); await api.upload('/session-fixture', body) }
      else await api.get('/session-fixture')
      return 'unexpected success'
    } catch (error) { return (error as Error).message }
  }, kind)
  await expect.poll(() => requests).toBe(1)
  await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/stores/authStore.ts')!
    const { useAuthStore } = await import(/* @vite-ignore */ path)
    const state = useAuthStore.getState()
    // Even identical credentials represent a new explicit login session.
    state.login(state.user, state.token, state.refreshToken)
  })
  release()
  expect(await outcome).toContain('Account session changed')
  expect(refreshes).toBe(0)
  expect(requests).toBe(1)
  if (kind === 'upload') expect(contentType).toContain('multipart/form-data; boundary=')
})

test('API refresh outage preserves the current authenticated session', async ({ authedPage: page }) => {
  await page.goto('/settings')
  await page.route('**/api/session-fixture', route => route.fulfill({ status: 401, json: { error: 'Expired' } }))
  await page.route('**/api/auth/refresh', route => route.fulfill({ status: 503, json: { error: 'Unavailable' } }))
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('rentos-auth')!).state)
  const result = await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/lib/api.ts')!
    const { api } = await import(/* @vite-ignore */ path)
    try { await api.get('/session-fixture'); return 'unexpected success' } catch (error) { return (error as Error).message }
  })
  expect(result).toContain('temporarily unavailable')
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('rentos-auth')!).state)
  expect(after.token).toBe(before.token)
  expect(after.isAuthenticated).toBe(true)
})

test('a new login does not join an older session refresh', async ({ authedPage: page }) => {
  await page.goto('/settings')
  const initial = await page.evaluate(() => JSON.parse(localStorage.getItem('rentos-auth')!).state)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let refreshes = 0, newRequests = 0
  await page.route('**/api/session-old', route => route.fulfill({ status: 401 }))
  await page.route('**/api/session-new', route => { newRequests++; return route.fulfill(newRequests === 1 ? { status: 401 } : { json: { data: 'new session result' } }) })
  await page.route('**/api/auth/refresh', async route => {
    refreshes++
    if (refreshes === 1) { await gate; return route.fulfill({ status: 401 }) }
    return route.fulfill({ json: { data: { token: initial.token, refreshToken: initial.refreshToken } } })
  })
  const oldOutcome = page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/lib/api.ts')!
    const { api } = await import(path)
    try { await api.get('/session-old'); return 'unexpected success' } catch (error) { return (error as Error).message }
  })
  await expect.poll(() => refreshes).toBe(1)
  await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/stores/authStore.ts')!
    const { useAuthStore } = await import(path)
    const state = useAuthStore.getState(); state.login(state.user, state.token, state.refreshToken)
  })
  const newOutcome = page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/lib/api.ts')!
    const { api } = await import(path)
    return api.get('/session-new')
  })
  await expect.poll(() => refreshes).toBe(2)
  expect(await newOutcome).toBe('new session result')
  release()
  expect(await oldOutcome).toContain('Account session changed')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rentos-auth')!).state.isAuthenticated)).toBe(true)
})

test('late 401 reuses credentials already rotated by another request', async ({ authedPage: page }) => {
  await page.goto('/settings')
  const user = await page.evaluate(() => JSON.parse(localStorage.getItem('rentos-auth')!).state.user)
  await page.route('**/api/**', route => route.fulfill({ json: { data: { items: [], total: 0 } } }))
  await page.route('**/api/users/me', route => route.fulfill({ json: { data: user } }))
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let slowRequests = 0, fastRequests = 0, refreshes = 0
  await page.route('**/api/session-slow', async route => { slowRequests++; if (slowRequests === 1) { await gate; return route.fulfill({ status: 401 }) } return route.fulfill({ json: { data: 'slow recovered' } }) })
  await page.route('**/api/session-fast', route => { fastRequests++; return route.fulfill(fastRequests === 1 ? { status: 401 } : { json: { data: 'fast recovered' } }) })
  await page.route('**/api/auth/refresh', route => { refreshes++; return route.fulfill({ json: { data: { token: 'rotated-access', refreshToken: 'rotated-refresh' } } }) })
  const slow = page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/lib/api.ts')!
    const { api } = await import(path); return api.get('/session-slow')
  })
  await expect.poll(() => slowRequests).toBe(1)
  const fast = await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/lib/api.ts')!
    const { api } = await import(path); return api.get('/session-fast')
  })
  expect(fast).toBe('fast recovered')
  release()
  expect(await slow).toBe('slow recovered')
  expect(refreshes).toBe(1)
  expect(slowRequests).toBe(2)
  expect(fastRequests).toBe(2)
})

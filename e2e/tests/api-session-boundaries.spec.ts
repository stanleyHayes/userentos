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

// Auth routes never refresh on a 401 (on the two-factor ones it can mean a wrong
// code), so a password or two-factor change made after the access token lapsed
// renews the session before sending the change.
const renewals = [
  { title: 'a password change with an expired access token refreshes before it is sent', expired: true, refresh: 'accepted' },
  { title: 'a password change whose expired session cannot refresh signs out without sending it', expired: true, refresh: 'rejected' },
  { title: 'a password change with a live access token is sent without a refresh', expired: false, refresh: 'accepted' },
] as const
for (const { title, expired, refresh } of renewals) test(title, async ({ authedPage: page }) => {
  await page.goto('/settings')
  const user = await page.evaluate(() => JSON.parse(localStorage.getItem('rentos-auth')!).state.user)
  await page.route('**/api/**', route => route.fulfill({ json: { data: { items: [], total: 0 } } }))
  await page.route('**/api/users/me', route => route.fulfill({ json: { data: user } }))
  const seconds = Math.floor(Date.now() / 1000)
  const access = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp: expired ? seconds - 60 : seconds + 600 })).toString('base64url')}.fixture`
  let refreshes = 0
  const presented: string[] = []
  await page.route('**/api/auth/refresh', route => {
    refreshes++
    return route.fulfill(refresh === 'accepted' ? { json: { data: { token: 'refreshed-access', refreshToken: 'refreshed-refresh' } } } : { status: 401, json: { error: 'Invalid or expired refresh token' } })
  })
  await page.route('**/api/auth/change-password', route => {
    const bearer = route.request().headers().authorization ?? ''
    presented.push(bearer)
    // Like the server, an expired access token is refused here and never refreshed.
    return route.fulfill(bearer === `Bearer ${expired ? 'refreshed-access' : access}` ? { json: { data: { token: 'renewed-access', refreshToken: 'renewed-refresh' } } } : { status: 401, json: { error: 'Invalid or expired token' } })
  })
  const outcome = await page.evaluate(async access => {
    const find = (pathname: string) => performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === pathname)!
    const { useAuthStore, renewSessionWith } = await import(find('/src/stores/authStore.ts'))
    const { api } = await import(find('/src/lib/api.ts'))
    useAuthStore.setState({ token: access })
    try {
      await renewSessionWith(() => api.post('/auth/change-password', { currentPassword: 'password123', newPassword: 'Renewed-fixture-1' }))
    } catch (error) { return (error as Error).message }
    const { token, refreshToken, isAuthenticated } = useAuthStore.getState()
    return { token, refreshToken, isAuthenticated }
  }, access)
  expect(refreshes).toBe(expired ? 1 : 0)
  if (refresh === 'rejected') {
    expect(outcome).toBe('Session expired')
    expect(presented).toEqual([])
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('rentos-auth')!).state.isAuthenticated)).toBe(false)
    return
  }
  expect(outcome).toEqual({ token: 'renewed-access', refreshToken: 'renewed-refresh', isAuthenticated: true })
  expect(presented).toEqual([`Bearer ${expired ? 'refreshed-access' : access}`])
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rentos-auth')!).state.refreshToken)).toBe('renewed-refresh')
})

test('"Log out all" with an expired access token refreshes first, then signs every session out', async ({ authedPage: page }) => {
  await page.goto('/settings?tab=security')
  await expect(page.getByRole('button', { name: 'Log out all' })).toBeVisible({ timeout: 20_000 })
  const seconds = Math.floor(Date.now() / 1000)
  const expired = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp: seconds - 60 })).toString('base64url')}.fixture`
  let refreshes = 0
  const presented: string[] = []
  await page.route('**/api/auth/refresh', route => { refreshes++; return route.fulfill({ json: { data: { token: 'refreshed-access', refreshToken: 'refreshed-refresh' } } }) })
  await page.route('**/api/auth/logout-all', route => {
    const bearer = route.request().headers().authorization ?? ''
    presented.push(bearer)
    // Like the server: /auth/ routes answer an expired token with a 401 and are never retried.
    return route.fulfill(bearer === 'Bearer refreshed-access' ? { json: { data: null } } : { status: 401, json: { error: 'Invalid or expired token' } })
  })
  await page.evaluate(async token => {
    const find = (pathname: string) => performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === pathname)!
    const { useAuthStore } = await import(find('/src/stores/authStore.ts'))
    useAuthStore.setState({ token })
  }, expired)
  await page.getByRole('button', { name: 'Log out all' }).click()
  await expect.poll(() => presented).toEqual(['Bearer refreshed-access'])
  // The page's own background requests may refresh in parallel with the same
  // expired token; what matters is that "Log out all" went out renewed.
  expect(refreshes).toBeGreaterThanOrEqual(1)
})

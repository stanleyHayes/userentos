import { test, expect } from '../fixtures/auth'
import type { Page } from '@playwright/test'

/** The URL Vite served this tab for an app module, so tests act on the tab's own instance. */
async function moduleUrl(page: Page, pathname: string) {
  const url = await page.evaluate(pathname => performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === pathname) ?? null, pathname)
  if (!url) throw new Error(`${pathname} module not loaded in this tab`)
  return url
}

async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/stores/authStore.ts')
    if (!path) throw new Error('authStore module not loaded in this tab')
    const { useAuthStore, getSessionGeneration } = await import(path)
    const { user, isAuthenticated, sessionId, token, refreshToken } = useAuthStore.getState()
    return { id: user?.id, firstName: user?.firstName, activeRole: user?.activeRole, isAuthenticated, sessionId, token, refreshToken, generation: getSessionGeneration() }
  })
}

const storedRefreshToken = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('rentos-auth') ?? 'null')?.state?.refreshToken ?? null)

/** Memory and storage together, so a failure says whether the event was lost or storage was overwritten. */
const refreshTokenIn = async (page: Page) => ({ memory: (await snapshot(page)).refreshToken, stored: await storedRefreshToken(page) })

// A routed Settings page, not just persisted state (true before React renders),
// shows DashboardLayout mounted and its session verification under way.
async function openSettings(page: Page) {
  await page.goto('/settings')
  await expect(page.locator('[data-tab-key="profile"]')).toBeVisible()
}

for (const transition of ['logout', 'same-user login', 'remove storage']) test(`another tab's ${transition} invalidates old requests`, async ({ authedPage: page, context }) => {
  await openSettings(page)
  const other = await context.newPage()
  await openSettings(other)
  const before = await snapshot(page)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let received = false
  await page.route('**/api/tab-session-fixture', async route => { received = true; await gate; return route.fulfill({ json: { data: 'old private response' } }) })
  const outcome = page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/lib/api.ts')!
    const { api } = await import(path)
    try { await api.get('/tab-session-fixture'); return 'unexpected success' } catch (error) { return (error as Error).message }
  })
  await expect.poll(() => received).toBe(true)
  await other.evaluate(async transition => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/stores/authStore.ts')!
    const { useAuthStore } = await import(path)
    const state = useAuthStore.getState()
    if (transition === 'logout') state.logout()
    else if (transition === 'same-user login') state.login(state.user, state.token, state.refreshToken)
    else localStorage.removeItem('rentos-auth')
  }, transition)
  await expect.poll(async () => (await snapshot(page)).generation).toBeGreaterThan(before.generation)
  release()
  expect(await outcome).toContain('Account session changed')
  if (transition === 'same-user login') {
    expect((await snapshot(page)).id).toBe(before.id)
    expect((await snapshot(page)).sessionId).not.toBe(before.sessionId)
  } else {
    await expect.poll(async () => (await snapshot(page)).isAuthenticated).toBe(false)
    await expect.poll(() => page.evaluate(() => localStorage.getItem('rentos-auth-profile'))).toBeNull()
  }
  await other.close()
})

test('same-session credential updates sync across tabs without changing login generation', async ({ authedPage: page, context }) => {
  await openSettings(page)
  const other = await context.newPage()
  await openSettings(other)
  const before = await snapshot(page)
  await other.evaluate(async url => {
    const { useAuthStore } = await import(url)
    useAuthStore.setState({ refreshToken: 'rotated-fixture-refresh' })
  }, await moduleUrl(other, '/src/stores/authStore.ts'))
  for (const tab of [page, other]) await expect.poll(() => refreshTokenIn(tab)).toEqual({ memory: 'rotated-fixture-refresh', stored: 'rotated-fixture-refresh' })
  expect((await snapshot(page)).generation).toBe(before.generation)
  expect((await snapshot(page)).sessionId).toBe(before.sessionId)
  await other.close()
})

// Deterministic form of the race behind the test above: a tab that has not yet
// applied another tab's rotation changes the profile. When credentials and
// profile shared one storage value, that write put the rotated-away refresh
// token back, and the next refresh with it signed the account out.
for (const change of ['profile edit', 'role switch']) test(`a ${change} from a tab behind a token rotation keeps the rotated refresh token`, async ({ authedPage: page, context }) => {
  // Hold back storage events so this tab keeps acting on its stale credentials.
  // /terms mounts no session verification, so the change below is the only writer.
  await page.addInitScript(() => window.addEventListener('storage', event => event.stopImmediatePropagation(), true))
  await page.goto('/terms')
  const other = await context.newPage()
  await other.goto('/terms')
  const [pageStore, otherStore] = [await moduleUrl(page, '/src/stores/authStore.ts'), await moduleUrl(other, '/src/stores/authStore.ts')]
  if (change === 'role switch') await page.evaluate(async url => {
    const { useAuthStore } = await import(url)
    const { user, updateUser } = useAuthStore.getState()
    updateUser({ roles: [...new Set([...user.roles, 'landlord'])] })
  }, pageStore)
  await other.evaluate(async url => {
    const { useAuthStore } = await import(url)
    useAuthStore.setState({ refreshToken: 'rotated-fixture-refresh' })
  }, otherStore)
  expect((await snapshot(page)).refreshToken).not.toBe('rotated-fixture-refresh')
  await page.evaluate(async ({ url, change }) => {
    const { useAuthStore } = await import(url)
    const state = useAuthStore.getState()
    if (change === 'role switch') state.switchRole('landlord')
    else state.updateUser({ firstName: 'Edited here' })
  }, { url: pageStore, change })
  await expect.poll(() => storedRefreshToken(page)).toBe('rotated-fixture-refresh')
  // The other tab keeps the rotation and still receives the profile change.
  const profile = change === 'role switch' ? { activeRole: 'landlord' } : { firstName: 'Edited here' }
  await expect.poll(async () => snapshot(other)).toMatchObject({ refreshToken: 'rotated-fixture-refresh', isAuthenticated: true, ...profile })
  await expect.poll(() => storedRefreshToken(other)).toBe('rotated-fixture-refresh')
  await other.close()
})

const pendingRefreshLocks = (page: Page) => page.evaluate(async () => (await navigator.locks.query()).pending?.filter(lock => lock.name?.startsWith('rentos-auth-refresh:')).length ?? 0)

const handoffs = [
  { title: 'two tabs recovering expired API requests converge on one pair (at most one extra refresh)', holdHandoff: false },
  { title: "a tab queued behind another tab's refresh adopts its rotated pair without refreshing again", holdHandoff: true },
]
for (const { title, holdHandoff } of handoffs) test(title, async ({ authedPage: page, context }) => {
  await openSettings(page)
  const other = await context.newPage()
  await openSettings(other)
  const initial = await page.evaluate(() => JSON.parse(localStorage.getItem('rentos-auth')!).state)
  await context.route('**/api/**', route => route.fulfill({ json: { data: { items: [], total: 0 } } }))
  await context.route('**/api/users/me', route => route.fulfill({ json: { data: initial.user } }))
  let requests = 0
  const presented: string[] = []
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await context.route('**/api/tab-refresh-fixture', route => {
    requests++
    return route.fulfill(route.request().headers().authorization === 'Bearer shared-rotated-access' ? { json: { data: 'recovered' } } : { status: 401 })
  })
  await context.route('**/api/auth/refresh', async route => {
    presented.push(route.request().postDataJSON().refreshToken)
    await gate
    return route.fulfill({ json: { data: { token: 'shared-rotated-access', refreshToken: 'shared-rotated-refresh' } } })
  })
  const apiUrl = await moduleUrl(page, '/src/lib/api.ts')
  const request = (tab: Page) => tab.evaluate(async url => {
    const { api } = await import(url)
    return api.get('/tab-refresh-fixture')
  }, apiUrl)
  const first = request(page)
  await expect.poll(() => presented.length).toBe(1)
  // A test-held lock queued in the waiting tab ahead of its refresh. The queue is
  // FIFO, so that refresh takes the lock only once the test lets go, which it
  // does after the rotated pair is visible in the waiting tab's own storage.
  type Hold = { releaseRefreshHold?: () => void }
  if (holdHandoff) await other.evaluate(name => {
    void navigator.locks.request(name, () => new Promise<void>(resolve => { (window as Hold).releaseRefreshHold = resolve }))
  }, `rentos-auth-refresh:${initial.sessionId}`)
  const second = request(other)
  await expect.poll(() => requests).toBe(2)
  // While the first tab's rotation is in flight the second waits on the shared lock.
  await expect.poll(() => pendingRefreshLocks(page)).toBe(holdHandoff ? 2 : 1)
  expect(presented).toHaveLength(1)
  release()
  expect(await first).toBe('recovered')
  if (holdHandoff) {
    await expect.poll(() => storedRefreshToken(other)).toBe('shared-rotated-refresh')
    await other.evaluate(() => (window as Hold).releaseRefreshHold!())
  }
  expect(await second).toBe('recovered')
  expect(requests).toBe(4)
  if (holdHandoff) {
    // A waiting tab that refreshed again would spend the server's one grace
    // re-issue, and a third tab would then sign every device out.
    expect(presented).toEqual([initial.refreshToken])
  } else {
    // After the lock passes on, the second tab normally finds the rotated pair in
    // storage. If its read beats the first tab's write reaching it, it refreshes
    // with the original token once more, which the server's rotation grace answers.
    expect(presented.length).toBeLessThanOrEqual(2)
    expect(presented.every(token => token === initial.refreshToken)).toBe(true)
  }
  for (const tab of [page, other]) await expect.poll(() => refreshTokenIn(tab)).toEqual({ memory: 'shared-rotated-refresh', stored: 'shared-rotated-refresh' })
  await other.close()
})

// The previous lock holder's stored pair can reach the next holder after that
// tab has already refreshed with the token the holder rotated. Simulated here by
// storing another tab's pair while this tab's refresh is held in flight.
for (const answer of ['a fresh pair', 'a rejection']) test(`a refresh answered with ${answer} after another tab's rotation arrives keeps the tab signed in`, async ({ authedPage: page, context }) => {
  await openSettings(page)
  const other = await context.newPage()
  await openSettings(other)
  const initial = await page.evaluate(() => JSON.parse(localStorage.getItem('rentos-auth')!).state)
  await context.route('**/api/**', route => route.fulfill({ json: { data: { items: [], total: 0 } } }))
  await context.route('**/api/users/me', route => route.fulfill({ json: { data: initial.user } }))
  // The server re-issues a just-rotated token once (retiring the pair it was
  // rotated into), or refuses it when that re-issue was already spent.
  const live = answer === 'a fresh pair' ? { token: 'regranted-access', refreshToken: 'regranted-refresh' } : { token: 'holder-access', refreshToken: 'holder-refresh' }
  await context.route('**/api/tab-regrant-fixture', route => route.fulfill(route.request().headers().authorization === `Bearer ${live.token}` ? { json: { data: 'recovered' } } : { status: 401 }))
  let refreshes = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await context.route('**/api/auth/refresh', async route => {
    refreshes++
    await gate
    return route.fulfill(answer === 'a fresh pair' ? { json: { data: live } } : { status: 401, json: { error: 'Invalid or expired refresh token' } })
  })
  const outcome = page.evaluate(async url => {
    const { api } = await import(url)
    try { return await api.get('/tab-regrant-fixture') } catch (error) { return (error as Error).message }
  }, await moduleUrl(page, '/src/lib/api.ts'))
  await expect.poll(() => refreshes).toBe(1)
  await other.evaluate(async url => {
    const { useAuthStore } = await import(url)
    useAuthStore.setState({ token: 'holder-access', refreshToken: 'holder-refresh' })
  }, await moduleUrl(other, '/src/stores/authStore.ts'))
  await expect.poll(async () => (await snapshot(page)).refreshToken).toBe('holder-refresh')
  release()
  expect(await outcome).toBe('recovered')
  for (const tab of [page, other]) {
    await expect.poll(() => refreshTokenIn(tab)).toEqual({ memory: live.refreshToken, stored: live.refreshToken })
    expect(await snapshot(tab)).toMatchObject({ isAuthenticated: true, sessionId: initial.sessionId })
  }
  expect(refreshes).toBe(1)
  await other.close()
})

test('two tabs whose access token expired together end on one live refresh token', async ({ authedPage: page, context }) => {
  await openSettings(page)
  const other = await context.newPage()
  await openSettings(other)
  const initial = await page.evaluate(() => JSON.parse(localStorage.getItem('rentos-auth')!).state)
  // Hold the real refresh endpoint until the second tab is queued on the refresh
  // lock behind the first. Whether it then reads the first tab's stored pair or
  // refreshes with the original token into the server's grace re-issue is down
  // to timing here; the mocked "a refresh answered with a fresh pair / a
  // rejection" tests above cover that path deterministically.
  let refreshes = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await context.route('**/api/auth/refresh', async route => { refreshes++; await gate; await route.continue() })
  await page.evaluate(async url => {
    const { useAuthStore } = await import(url)
    useAuthStore.setState({ token: 'expired-fixture-access' })
  }, await moduleUrl(page, '/src/stores/authStore.ts'))
  for (const tab of [page, other]) await expect.poll(async () => (await snapshot(tab)).token).toBe('expired-fixture-access')
  const apiUrl = await moduleUrl(page, '/src/lib/api.ts')
  const request = (tab: Page) => tab.evaluate(async url => {
    const { api } = await import(url)
    return (await api.get('/users/me') as { id: string }).id
  }, apiUrl)
  const results = Promise.all([request(page), request(other)])
  await expect.poll(() => refreshes).toBeGreaterThan(0)
  await expect.poll(() => pendingRefreshLocks(page)).toBe(1)
  release()
  expect(await results).toEqual([initial.user.id, initial.user.id])
  await expect.poll(async () => {
    const [a, b] = [await snapshot(page), await snapshot(other)]
    return a.isAuthenticated && b.isAuthenticated && a.token !== 'expired-fixture-access' && a.token === b.token && a.refreshToken === b.refreshToken && a.refreshToken === await storedRefreshToken(page) && a.refreshToken === await storedRefreshToken(other)
  }).toBe(true)
  const { token, refreshToken } = await snapshot(page)
  expect(refreshToken).not.toBe(initial.refreshToken)
  // What the tabs kept is the live pair: neither retired by a second refresh nor revoked.
  expect((await page.request.get('/api/users/me', { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(200)
  expect((await page.request.post('/api/auth/refresh', { data: { refreshToken } })).status()).toBe(200)
  await other.close()
})

for (const transition of ['logout', 'new login']) test(`delayed profile cannot overwrite remote ${transition} before storage-event delivery`, async ({ authedPage: page, context }) => {
  const other = await context.newPage()
  await openSettings(other)
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('rentos-auth')!).state)
  await context.route('**/api/**', route => route.fulfill({ json: { data: { items: [], total: 0 } } }))
  await context.route('**/api/users/me', route => route.fulfill({ json: { data: original.user } }))
  await page.addInitScript(() => window.addEventListener('storage', event => event.stopImmediatePropagation(), true))
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let waiting = false
  await page.route('**/api/users/me', async route => {
    if (route.request().headers().authorization === 'Bearer new-login-token') return route.fulfill({ json: { data: original.user } })
    waiting = true; await gate
    return route.fulfill({ json: { data: { ...original.user, firstName: 'Stale profile' } } })
  })
  await page.reload()
  await expect.poll(() => waiting).toBe(true)
  await other.evaluate(async transition => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/stores/authStore.ts')!
    const { useAuthStore } = await import(path)
    const state = useAuthStore.getState()
    if (transition === 'logout') state.logout()
    else state.login(state.user, 'new-login-token', 'new-login-refresh')
  }, transition)
  const latest = await other.evaluate(() => JSON.parse(localStorage.getItem('rentos-auth')!).state)
  expect((await snapshot(page)).sessionId).toBe(original.sessionId)
  release()
  await expect.poll(async () => (await snapshot(page)).sessionId).toBe(latest.sessionId)
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('rentos-auth')!).state)
  expect(persisted.token).toBe(latest.token)
  expect(persisted.isAuthenticated).toBe(latest.isAuthenticated)
  expect(persisted.user?.firstName).not.toBe('Stale profile')
  expect((await snapshot(page)).firstName).not.toBe('Stale profile')
  expect(await page.evaluate(() => localStorage.getItem('rentos-auth-profile') ?? '')).not.toContain('Stale profile')
  await other.close()
})

import { test, expect } from '../fixtures/auth'
import type { Page } from '@playwright/test'

async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/stores/authStore.ts')!
    const { useAuthStore, getSessionGeneration } = await import(path)
    const { user, isAuthenticated, sessionId, refreshToken } = useAuthStore.getState()
    return { id: user?.id, isAuthenticated, sessionId, refreshToken, generation: getSessionGeneration() }
  })
}

for (const transition of ['logout', 'same-user login', 'remove storage']) test(`another tab's ${transition} invalidates old requests`, async ({ authedPage: page, context }) => {
  await page.goto('/settings')
  const other = await context.newPage()
  await other.goto('/settings')
  await expect.poll(async () => (await snapshot(other)).isAuthenticated).toBe(true)
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
  } else await expect.poll(async () => (await snapshot(page)).isAuthenticated).toBe(false)
  await other.close()
})

test('same-session credential updates sync across tabs without changing login generation', async ({ authedPage: page, context }) => {
  await page.goto('/settings')
  const other = await context.newPage()
  await other.goto('/settings')
  await expect.poll(async () => (await snapshot(other)).isAuthenticated).toBe(true)
  const before = await snapshot(page)
  await other.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/stores/authStore.ts')!
    const { useAuthStore } = await import(path)
    useAuthStore.setState({ refreshToken: 'rotated-fixture-refresh' })
  })
  await expect.poll(async () => (await snapshot(page)).refreshToken).toBe('rotated-fixture-refresh')
  expect((await snapshot(page)).generation).toBe(before.generation)
  expect((await snapshot(page)).sessionId).toBe(before.sessionId)
  await other.close()
})

test('two tabs recover expired API requests with one refresh rotation', async ({ authedPage: page, context }) => {
  await page.goto('/settings')
  const other = await context.newPage()
  await other.goto('/settings')
  await expect.poll(async () => (await snapshot(other)).isAuthenticated).toBe(true)
  const user = await page.evaluate(() => JSON.parse(localStorage.getItem('rentos-auth')!).state.user)
  await context.route('**/api/**', route => route.fulfill({ json: { data: { items: [], total: 0 } } }))
  await context.route('**/api/users/me', route => route.fulfill({ json: { data: user } }))
  let requests = 0, refreshes = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await context.route('**/api/tab-refresh-fixture', route => {
    requests++
    return route.fulfill(route.request().headers().authorization === 'Bearer shared-rotated-access' ? { json: { data: 'recovered' } } : { status: 401 })
  })
  await context.route('**/api/auth/refresh', async route => {
    refreshes++
    await gate
    return route.fulfill({ json: { data: { token: 'shared-rotated-access', refreshToken: 'shared-rotated-refresh' } } })
  })
  const request = (tab: Page) => tab.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/lib/api.ts')!
    const { api } = await import(path)
    return api.get('/tab-refresh-fixture')
  })
  const first = request(page)
  await expect.poll(() => refreshes).toBe(1)
  const second = request(other)
  await expect.poll(() => requests).toBe(2)
  release()
  expect(await first).toBe('recovered')
  expect(await second).toBe('recovered')
  expect(refreshes).toBe(1)
  expect(requests).toBe(4)
  expect((await snapshot(page)).refreshToken).toBe('shared-rotated-refresh')
  expect((await snapshot(other)).refreshToken).toBe('shared-rotated-refresh')
  await other.close()
})

for (const transition of ['logout', 'new login']) test(`delayed profile cannot overwrite remote ${transition} before storage-event delivery`, async ({ authedPage: page, context }) => {
  const other = await context.newPage()
  await other.goto('/settings')
  await expect.poll(async () => (await snapshot(other)).isAuthenticated).toBe(true)
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
  await other.close()
})

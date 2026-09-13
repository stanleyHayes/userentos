import { test, expect } from '../fixtures/auth'

test('web checkout bounds a stalled response and retries the same payment key', async ({ authedPage: page }) => {
  await page.goto('/payments')
  await page.clock.install()
  const keys: string[] = []
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/payments', async route => {
    if (route.request().method() !== 'POST') return route.continue()
    keys.push(route.request().headers()['idempotency-key'])
    if (keys.length === 1) await gate
    await route.fulfill({ json: { data: { payment: { id: 'original-payment' } } } }).catch(() => undefined)
  })
  const invoke = () => page.evaluate(async () => {
    const path = '/src/lib/api.ts'
    const { api } = await import(path)
    try { return await api.post('/payments', { agreementId: 'timeout-fixture', amount: 100 }) }
    catch (failure) { return { error: (failure as Error).message } }
  })
  const first = invoke()
  await expect.poll(() => keys.length).toBe(1)
  await page.clock.fastForward(30_001)
  expect(await first).toMatchObject({ error: expect.stringContaining('timed out') })
  release()
  expect(await invoke()).toEqual({ payment: { id: 'original-payment' } })
  expect(keys).toHaveLength(2)
  expect(keys[1]).toBe(keys[0])
})

test('a delayed checkout 401 cannot refresh or retry as a replacement account', async ({ authedPage: page }) => {
  await page.goto('/payments')
  // Keep unrelated page queries from producing their own 401 after the
  // deliberate replacement-account token below.
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/payments' && route.request().method() === 'POST') return route.fallback()
    if (path === '/api/auth/refresh') return route.fallback()
    return route.fulfill({ json: { data: { items: [], total: 0 } } })
  })
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let posts = 0, refreshes = 0
  await page.route('**/api/payments', async route => {
    if (route.request().method() !== 'POST') return route.continue()
    posts++; await gate
    return route.fulfill({ status: 401, json: { error: 'Expired' } })
  })
  await page.route('**/api/auth/refresh', route => { refreshes++; return route.fulfill({ status: 500 }) })
  const outcome = page.evaluate(async () => {
    const path = '/src/lib/api.ts'
    const { api } = await import(path)
    try { await api.post('/payments', { agreementId: 'session-test', amount: 100 }); return 'unexpected success' }
    catch (failure) { return (failure as Error).message }
  })
  await expect.poll(() => posts).toBe(1)
  await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => new URL(name).pathname === '/src/stores/authStore.ts')!
    if (!path) throw new Error('Loaded auth module not found')
    const { useAuthStore } = await import(path)
    useAuthStore.setState({ token: 'new-token', user: { ...useAuthStore.getState().user, id: 'replacement-owner' } })
  })
  release()
  expect(await outcome).toContain('Account session changed')
  expect(posts).toBe(1); expect(refreshes).toBe(0)
})

test('web rent checkout retains its retry key after network failure and reload', async ({ authedPage: page }) => {
  const keys: string[] = []
  await page.route('**/api/payments', async route => {
    if (route.request().method() !== 'POST') return route.continue()
    keys.push(route.request().headers()['idempotency-key'])
    if (keys.length === 1) return route.abort('connectionreset')
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { payment: { id: 'original', status: 'pending' }, instructions: 'Original payment instructions' } }) })
  })
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto('/payments')
    await page.getByTestId('make-payment-button').click()
    const start = page.getByLabel('Rent period from', { exact: false })
    await expect(start).toHaveAttribute('min', /\d{4}-\d{2}-\d{2}/)
    const date = (await start.getAttribute('min'))!
    await start.fill(date)
    await page.getByLabel('Rent period through', { exact: false }).fill(date)
    await page.getByTestId('payment-amount-input').fill('100')
    await page.getByTestId('payment-submit').click()
    await expect.poll(() => keys.length).toBe(attempt + 1)
    if (attempt === 0) await expect(page.getByTestId('payment-submit')).toBeEnabled()
  }
  expect(keys[0]).toMatch(/^[\da-f-]{36}$/)
  expect(keys[1]).toBe(keys[0])
  await expect(page.getByText('Original payment instructions', { exact: true })).toBeVisible()
})

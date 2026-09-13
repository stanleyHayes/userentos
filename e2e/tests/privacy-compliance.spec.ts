import { test, expect } from '@playwright/test'
import { io } from 'socket.io-client'

test('account closure disconnects browser and device sockets and rejects the old session', async ({ page, request, baseURL }) => {
  const registered = await request.post('/api/auth/register', { data: {
    email: `socket-${Date.now()}@rentos.test`, phone: '0241234567', password: 'E2e!Password123', firstName: 'Socket', lastName: 'Test', role: 'tenant',
  } })
  expect(registered.status()).toBe(201)
  const { data } = await registered.json()
  const headers = { Authorization: `Bearer ${data.token}` }
  const device = io(baseURL!, { auth: { token: data.token }, transports: ['websocket'], reconnection: false, autoConnect: false })
  let closed = false
  try {
    const browserEvents: string[] = []
    page.on('console', message => browserEvents.push(message.text()))
    await page.addInitScript(({ user, token, refreshToken }) => {
      localStorage.setItem('rentos-auth', JSON.stringify({ state: { user, token, refreshToken, isAuthenticated: true }, version: 0 }))
    }, data)
    await page.goto('/my-profile')
    await expect.poll(() => browserEvents.some(message => message.startsWith('[Socket] Connected:'))).toBe(true)
    device.connect()
    await expect.poll(() => device.connected).toBe(true)
    const refreshed = await request.post('/api/auth/refresh', { data: { refreshToken: data.refreshToken } })
    expect(refreshed.status()).toBe(200)
    const session = (await refreshed.json()).data
    const connectionsBeforeRefresh = browserEvents.filter(message => message.startsWith('[Socket] Connected:')).length
    await page.evaluate(async session => {
      // Use the actual store transition performed by the HTTP refresh client.
      const storeModule = '/src/stores/authStore.ts'
      const { useAuthStore } = await import(storeModule)
      useAuthStore.setState({ token: session.token, refreshToken: session.refreshToken })
    }, session)
    await expect.poll(() => browserEvents.filter(message => message.startsWith('[Socket] Connected:')).length).toBeGreaterThan(connectionsBeforeRefresh)
    let disconnectReason = ''
    device.on('disconnect', reason => { disconnectReason = reason })
    expect((await request.delete('/api/users/me', { headers })).status()).toBe(200)
    closed = true
    await expect.poll(() => disconnectReason).toBe('io server disconnect')
    await expect.poll(() => browserEvents.some(message => message.includes('[Socket] Disconnected: io server disconnect'))).toBe(true)
    let rejection = ''
    device.on('connect_error', error => { rejection = error.message })
    device.connect()
    await expect.poll(() => rejection).toBe('Invalid token')
    expect(device.connected).toBe(false)
  } finally {
    device.disconnect()
    if (!closed) await request.delete('/api/users/me', { headers })
  }
})

test('tenant profile editor saves fetched data without sensitive demographics or read-only fields', async ({ page, request }) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const registered = await request.post('/api/auth/register', { data: {
    email: `profile-${suffix}@rentos.test`, phone: '0241234567', password: 'E2e!Password123', firstName: 'Profile', lastName: 'Test', role: 'tenant',
  } })
  expect(registered.status()).toBe(201)
  const { data } = await registered.json()
  const headers = { Authorization: `Bearer ${data.token}` }
  try {
    expect((await request.get('/api/tenant-profile/me', { headers })).status()).toBe(200)
    expect((await request.patch('/api/tenant-profile/me', { headers, data: {
      dateOfBirth: '1990-01-01', gender: 'female', maritalStatus: 'single', nationality: 'Ghanaian',
      primaryCurrency: 'USD', monthlyIncome: 1200, incomeSources: [{ source: 'Consulting', amount: 1200, currency: 'USD' }],
    } })).status()).toBe(200)
    expect((await request.patch('/api/tenant-profile/me', { headers, data: { religion: 'private' } })).status()).toBe(400)
    await page.addInitScript(({ user, token, refreshToken }) => {
      localStorage.setItem('rentos-auth', JSON.stringify({ state: { user, token, refreshToken, isAuthenticated: true }, version: 0 }))
    }, data)
    await page.goto('/my-profile')
    await page.getByRole('button', { name: 'Skip tour', exact: true }).click()
    await expect(page.getByLabel('About You (short bio)')).toBeVisible()
    await expect(page.getByLabel('Religion', { exact: true })).toHaveCount(0)
    await expect(page.getByLabel('Ethnic Group', { exact: true })).toHaveCount(0)
    await page.getByLabel('About You (short bio)').fill('Profile save regression')
    const saved = page.waitForResponse(response => response.url().includes('/tenant-profile/me') && response.request().method() === 'PATCH')
    await page.getByRole('button', { name: 'Save Profile' }).click()
    expect((await saved).status()).toBe(200)
    await page.reload()
    await expect(page.getByLabel('About You (short bio)')).toHaveValue('Profile save regression')
    const profile = (await (await request.get('/api/tenant-profile/me', { headers })).json()).data
    expect(profile.primaryCurrency).toBe('USD')
    expect(profile.incomeSources[0].currency).toBe('USD')
    expect(profile.religion).toBeUndefined()
  } finally {
    await request.delete('/api/users/me', { headers })
  }
})

test('public deletion page provides sign-in and a usable ownership-verification contact', async ({ page }) => {
  await page.goto('/delete-account')
  await expect(page.getByRole('heading', { name: 'Delete your RentOS Ghana account' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in to delete your account or download your data' })).toHaveAttribute('href', '/login')
  await expect(page.getByRole('link', { name: 'info@userentos.com', exact: true })).toHaveAttribute('href', /mailto:info@userentos.com/)
})

for (const entry of ['/delete-account', '/settings?tab=privacy']) test(`export then account deletion from ${entry} invalidates an existing token and refresh token`, async ({ page, request }) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const response = await request.post('/api/auth/register', { data: {
    email: `privacy-${suffix}@rentos.test`, phone: '0241234567', password: 'E2e!Password123', firstName: 'Privacy', lastName: 'Test', role: 'tenant',
  } })
  expect(response.status()).toBe(201)
  const { data } = await response.json()
  await page.addInitScript(({ user, token, refreshToken }) => {
    localStorage.setItem('rentos-auth', JSON.stringify({ state: { user, token, refreshToken, isAuthenticated: true }, version: 0 }))
  }, data)
  await page.goto(entry)
  const skipTour = page.getByRole('button', { name: 'Skip tour', exact: true })
  if (await skipTour.isVisible()) await skipTour.click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download my data' }).click()
  expect((await download).suggestedFilename()).toBe('rentos-personal-data.json')
  const exported = await request.get('/api/users/me/export', { headers: { Authorization: `Bearer ${data.token}` } })
  expect(exported.status()).toBe(200)
  const json = (await exported.json()).data
  expect(json.user.email).toBe(`privacy-${suffix}@rentos.test`)
  expect(json.user.passwordHash).toBeUndefined()
  expect(json.user.mfaSecret).toBeUndefined()
  await expect(page.getByRole('button', { name: 'Delete my account' })).toBeDisabled()
  await page.getByLabel('To permanently delete your account, type DELETE').fill('DELETE')
  await page.getByRole('button', { name: 'Delete my account' }).click()
  await expect(page.getByRole('status')).toContainText('Your account is closed')
  expect((await request.get('/api/users/me', { headers: { Authorization: `Bearer ${data.token}` } })).status()).toBe(401)
  expect((await request.post('/api/auth/refresh', { data: { refreshToken: data.refreshToken } })).status()).toBe(401)
})

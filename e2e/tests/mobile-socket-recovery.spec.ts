import { test, expect, type WebSocketRoute } from '@playwright/test'
const mobileUrl = process.env.MOBILE_WEB_URL
test.skip(!mobileUrl, 'Requires Expo web at MOBILE_WEB_URL')
test('mounted mobile hooks refresh expired sockets and resume notification delivery', async ({ page }) => {
  const user = { id: '507f1f77bcf86cd799439011', email: 'socket@rentos.test', firstName: 'Socket', lastName: 'Fixture', phone: '0241234567', roles: ['tenant'], activeRole: 'tenant', isVerified: true }
  const sockets: { route: WebSocketRoute; token: string }[] = []
  let expired = false, refreshes = 0
  await page.routeWebSocket('**/socket.io/**', ws => {
    ws.onMessage(message => {
      const frame = String(message)
      if (frame.startsWith('40')) {
        sockets.push({ route: ws, token: JSON.parse(frame.slice(2)).token })
        ws.send(`40${JSON.stringify({ sid: `mobile-${sockets.length}` })}`)
      }
    })
    ws.send(`0${JSON.stringify({ sid: 'mobile-engine', upgrades: [], pingInterval: 60000, pingTimeout: 60000, maxPayload: 1000000 })}`)
  })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    let data: unknown = { items: [], total: 0 }
    if (path === '/api/auth/login') data = { user, token: 'mobile-original', refreshToken: 'mobile-refresh' }
    if (path === '/api/users/me') {
      if (expired && route.request().headers().authorization === 'Bearer mobile-original') return route.fulfill({ status: 401, json: { error: 'Expired' } })
      data = user
    }
    if (path === '/api/auth/refresh') { refreshes++; data = { token: 'mobile-rotated', refreshToken: 'mobile-refresh-rotated' } }
    if (path === '/api/chat/unread-count') data = { count: 0 }
    await route.fulfill({ json: { success: true, data } })
  })
  await page.goto(`${mobileUrl}/auth/login`)
  await page.getByPlaceholder('you@example.com').fill(user.email)
  await page.getByPlaceholder('Enter your password').fill('E2e!Password123')
  await page.getByText('Sign in', { exact: true }).click()
  await expect.poll(() => sockets.some(s => s.token === 'mobile-original')).toBe(true)
  sockets.at(-1)!.route.send('42["notification:new",{"title":"Mobile socket ready","message":"Before expiry"}]')
  await expect(page.getByText('Mobile socket ready', { exact: true })).toBeVisible()
  expired = true
  sockets.at(-1)!.route.send('42["session:expired"]')
  sockets.at(-1)!.route.send('41')
  await expect.poll(() => sockets.some(s => s.token === 'mobile-rotated')).toBe(true)
  sockets.findLast(s => s.token === 'mobile-rotated')!.route.send('42["notification:new",{"title":"Mobile live updates resumed","message":"After expiry"}]')
  await expect(page.getByText('Mobile live updates resumed', { exact: true })).toBeVisible()
  expect(refreshes).toBe(1)
})

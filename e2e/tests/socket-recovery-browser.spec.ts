import type { WebSocketRoute } from '@playwright/test'
import { test, expect } from '../fixtures/auth'

for (const transition of ['unchanged', 'logout', 'replacement']) test(`mounted web socket expiry recovery respects ${transition}`, async ({ authedPage: page }) => {
  const initial = await page.evaluate(() => JSON.parse(localStorage.getItem('rentos-auth')!).state)
  const sockets: { route: WebSocketRoute; token: string }[] = []
  let expired = false, refreshCount = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  // Controlled Socket.IO frames exercise the actual browser client and React hooks.
  // Protocol: https://github.com/socketio/socket.io-protocol
  await page.routeWebSocket('**/socket.io/**', ws => {
    ws.onMessage(message => {
      const frame = String(message)
      if (frame.startsWith('40')) {
        sockets.push({ route: ws, token: JSON.parse(frame.slice(2)).token })
        ws.send(`40${JSON.stringify({ sid: `fixture-${sockets.length}` })}`)
      }
    })
    ws.send(`0${JSON.stringify({ sid: 'fixture-engine', upgrades: [], pingInterval: 60000, pingTimeout: 60000, maxPayload: 1000000 })}`)
  })
  await page.route('**/api/**', route => route.fulfill({ json: { data: { items: [], total: 0 } } }))
  await page.route('**/api/users/me', route => route.fulfill(expired && route.request().headers().authorization === `Bearer ${initial.token}` ? { status: 401, json: { error: 'Expired' } } : { json: { data: initial.user } }))
  await page.route('**/api/auth/refresh', async route => {
    refreshCount++
    await gate
    await route.fulfill({ json: { data: { token: 'socket-rotated-fixture', refreshToken: 'socket-refresh-fixture' } } })
  })
  await page.reload()
  await expect.poll(() => sockets.length).toBeGreaterThan(0)
  // Confirm actual notification listeners are installed before expiry.
  sockets.at(-1)!.route.send('42["notification:new",{"title":"Before expiry","message":"Socket is ready"}]')
  await expect(page.getByText('Before expiry: Socket is ready', { exact: true })).toBeVisible()
  expired = true
  const old = sockets.at(-1)!
  old.route.send('42["session:expired"]')
  old.route.send('41')
  await expect.poll(() => refreshCount).toBe(1)
  if (transition !== 'unchanged') await page.evaluate(async transition => {
    const path = performance.getEntriesByType('resource').map(e => e.name).find(name => new URL(name).pathname === '/src/stores/authStore.ts')!
    const { useAuthStore } = await import(path)
    if (transition === 'logout') useAuthStore.getState().logout()
    else useAuthStore.getState().login(useAuthStore.getState().user, 'replacement-socket-token', 'replacement-socket-refresh')
  }, transition)
  const refreshed = page.waitForResponse('**/api/auth/refresh')
  release()
  await refreshed
  if (transition === 'unchanged') {
    await expect.poll(() => sockets.some(s => s.token === 'socket-rotated-fixture')).toBe(true)
    sockets.findLast(s => s.token === 'socket-rotated-fixture')!.route.send('42["notification:new",{"title":"After expiry","message":"Live updates resumed"}]')
    await expect(page.getByText('After expiry: Live updates resumed', { exact: true })).toBeVisible()
    expect(refreshCount).toBe(1)
  } else {
    await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('rentos-auth')!).state.token)).toBe(transition === 'logout' ? null : 'replacement-socket-token')
    await page.waitForTimeout(200)
    expect(sockets.some(s => s.token === 'socket-rotated-fixture')).toBe(false)
  }
})

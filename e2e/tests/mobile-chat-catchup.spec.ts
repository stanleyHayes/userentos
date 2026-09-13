import { test, expect, type WebSocketRoute } from '@playwright/test'
const mobileUrl = process.env.MOBILE_WEB_URL
test.skip(!mobileUrl, 'Requires Expo web at MOBILE_WEB_URL')
test('mobile open chat reloads missed history after a transport reconnect', async ({ page }) => {
  const user = { id: '507f1f77bcf86cd799439011', email: 'chat@rentos.test', firstName: 'Chat', lastName: 'Fixture', phone: '0241234567', roles: ['tenant'], activeRole: 'tenant', isVerified: true }
  const sockets: WebSocketRoute[] = []
  let interrupted = false, histories = 0, joins = 0
  let sending = false
  let releaseSend!: () => void
  const sendGate = new Promise<void>(resolve => { releaseSend = resolve })
  let releaseHistory!: () => void
  const historyGate = new Promise<void>(resolve => { releaseHistory = resolve })
  await page.routeWebSocket('**/socket.io/**', ws => {
    sockets.push(ws)
    ws.onMessage(message => {
      const frame = String(message)
      if (frame.startsWith('40')) ws.send(`40${JSON.stringify({ sid: `chat-${sockets.length}` })}`)
      if (frame.startsWith('42["join:conversation"')) joins++
    })
    ws.send(`0${JSON.stringify({ sid: 'chat-engine', upgrades: [], pingInterval: 60000, pingTimeout: 60000, maxPayload: 1000000 })}`)
  })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    let data: unknown = { items: [], total: 0 }
    if (path === '/api/auth/login') data = { user, token: 'chat-original', refreshToken: 'chat-refresh' }
    if (path === '/api/users/me') data = user
    if (path === '/api/chat/conversations') data = [{ id: 'chat-fixture', otherUser: { id: 'peer', firstName: 'Peer', lastName: 'Fixture' }, unreadCount: 0 }]
    if (path === '/api/chat/conversations/chat-fixture/messages' && route.request().method() === 'POST') {
      sending = true
      await sendGate
      return route.fulfill({ json: { success: true, data: { id: 'confirmed-send', senderId: user.id, senderName: 'Chat Fixture', text: 'Pending mobile message', conversationId: 'chat-fixture', read: false, createdAt: '2026-09-01T12:02:00Z' } } })
    }
    if (path === '/api/chat/conversations/chat-fixture/messages') {
      histories++
      if (interrupted) await historyGate
      data = { items: [{ id: interrupted ? 'missed' : 'initial', conversationId: 'chat-fixture', senderId: 'peer', senderName: 'Peer Fixture', text: interrupted ? 'Mobile missed message recovered' : 'Initial mobile history', createdAt: '2026-09-01T12:00:00Z', read: false }], total: 1 }
    }
    if (path === '/api/chat/unread-count') data = { count: 0 }
    await route.fulfill({ json: { success: true, data } })
  })
  await page.goto(`${mobileUrl}/auth/login`)
  await page.getByPlaceholder('you@example.com').fill(user.email)
  await page.getByPlaceholder('Enter your password').fill('E2e!Password123')
  await page.getByText('Sign in', { exact: true }).click()
  await page.getByText('Messages', { exact: true }).last().click()
  await page.getByText('Peer Fixture', { exact: true }).first().click()
  await expect(page.getByText('Initial mobile history', { exact: true })).toBeVisible()
  await expect.poll(() => joins).toBeGreaterThan(0)
  const before = { histories, sockets: sockets.length, joins }
  interrupted = true
  await sockets.at(-1)!.close({ code: 1001, reason: 'Controlled mobile interruption' })
  await expect.poll(() => sockets.length).toBeGreaterThan(before.sockets)
  await expect.poll(() => joins).toBeGreaterThan(before.joins)
  await expect.poll(() => histories).toBeGreaterThan(before.histories)
  sockets.at(-1)!.send(`42${JSON.stringify(['message:new', { id: 'during-load', conversationId: 'chat-fixture', senderId: 'peer', senderName: 'Peer Fixture', text: 'Live message during history load', read: false, createdAt: '2026-09-01T12:01:00Z' }])}`)
  await expect(page.getByText('Live message during history load', { exact: true })).toBeVisible()
  await page.getByPlaceholder('Type a message...').fill('Pending mobile message')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect.poll(() => sending).toBe(true)
  await expect(page.getByText('Pending mobile message', { exact: true })).toBeVisible()
  releaseHistory()
  await expect(page.getByText('Mobile missed message recovered', { exact: true })).toBeVisible()
  await expect(page.getByText('Live message during history load', { exact: true })).toBeVisible()
  expect(histories).toBeGreaterThan(before.histories)
  await expect(page.getByText('Pending mobile message', { exact: true })).toBeVisible()
  releaseSend()
  await page.getByPlaceholder('Type a message...').fill('Next draft')
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeEnabled()
  await expect(page.getByText('Pending mobile message', { exact: true })).toHaveCount(1)
})

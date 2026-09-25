import { test, expect, type WebSocketRoute } from '@playwright/test'
import { io, type Socket } from 'socket.io-client'
import { acceptance } from '../fixtures/legalAcceptance'

test('open web chat rejoins after transport loss and receives typing and new messages', async ({ page, request }) => {
  const accounts: { user: { id: string }; token: string; refreshToken: string }[] = []
  const routes: WebSocketRoute[] = []
  let joins = 0
  let holdHistory = false, historyCaptured = false
  let releaseHistory!: () => void
  const historyGate = new Promise<void>(resolve => { releaseHistory = resolve })
  let holdReconnect = false
  let releaseReconnect!: () => void
  const reconnectGate = new Promise<void>(resolve => { releaseReconnect = resolve })
  let peer: Socket | undefined
  function event(socket: Socket, name: string) {
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => { socket.off(name, receive); reject(new Error(`Missing ${name}`)) }, 8000)
      function receive(value: unknown) { clearTimeout(timer); resolve(value) }
      socket.once(name, receive)
    })
  }
  try {
    for (const firstName of ['ReconnectOwner', 'ReconnectPeer']) {
      const response = await request.post('/api/auth/register', { data: { email: `${firstName}-${Date.now()}@rentos.test`, phone: '0241234567', password: 'E2e!Password123', firstName, lastName: 'Fixture', role: 'tenant', acceptance } })
      expect(response.status()).toBe(201)
      accounts.push((await response.json()).data)
    }
    const [owner, target] = accounts
    const created = await request.post('/api/chat/conversations', { headers: { Authorization: `Bearer ${owner.token}` }, data: { participantId: target.user.id } })
    expect(created.status()).toBe(201)
    const conversation = (await created.json()).data
    await page.route('**/api/chat/conversations/*/messages', async route => {
      if (!holdHistory || route.request().method() !== 'GET') return route.continue()
      const response = await route.fetch()
      historyCaptured = true
      await historyGate
      await route.fulfill({ response })
    })
    await page.routeWebSocket('**/socket.io/**', async ws => {
      if (holdReconnect) await reconnectGate
      const server = ws.connectToServer()
      routes.push(ws)
      ws.onMessage(message => {
        if (String(message).startsWith('42["join:conversation"')) joins++
        server.send(message)
      })
    })
    peer = io(process.env.E2E_SOCKET_API_URL || 'http://localhost:3402', { auth: { token: target.token }, transports: ['websocket'], reconnection: false, autoConnect: false })
    const ready = event(peer, 'connect'); peer.connect(); await ready
    peer.emit('join:conversation', conversation.id)
    await page.addInitScript(data => localStorage.setItem('rentos-auth', JSON.stringify({ state: { ...data, isAuthenticated: true }, version: 0 })), owner)
    await page.goto(`/messages?conversationId=${conversation.id}`)
    await page.getByRole('button', { name: 'Skip tour', exact: true }).click()
    await expect.poll(() => joins).toBeGreaterThan(0)
    const input = page.getByPlaceholder('Type a message...')
    const firstTyping = event(peer, 'typing:start')
    await input.fill('Before interruption')
    expect(await firstTyping).toMatchObject({ conversationId: conversation.id, userId: owner.user.id })
    const previousJoins = joins
    const previousConnections = routes.length
    holdReconnect = true
    await routes.at(-1)!.close({ code: 1001, reason: 'Controlled test interruption' })
    const missed = await request.post(`/api/chat/conversations/${conversation.id}/messages`, { headers: { Authorization: `Bearer ${target.token}` }, data: { text: 'Message sent during interruption' } })
    expect(missed.status()).toBe(201)
    holdHistory = true
    releaseReconnect()
    await expect.poll(() => routes.length).toBeGreaterThan(previousConnections)
    await expect.poll(() => joins).toBeGreaterThan(previousJoins)
    const resumedTyping = event(peer, 'typing:start')
    await input.fill('After interruption')
    expect(await resumedTyping).toMatchObject({ conversationId: conversation.id, userId: owner.user.id })
    await expect.poll(() => historyCaptured).toBe(true)
    const incoming = await request.post(`/api/chat/conversations/${conversation.id}/messages`, { headers: { Authorization: `Bearer ${target.token}` }, data: { text: 'Live message after real reconnect' } })
    expect(incoming.status()).toBe(201)
    await expect(page.getByText('Live message after real reconnect', { exact: true }).first()).toBeVisible()
    releaseHistory()
    await expect(page.getByText('Message sent during interruption', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Live message after real reconnect', { exact: true }).first()).toBeVisible()
  } finally {
    releaseHistory()
    releaseReconnect()
    peer?.disconnect()
    for (const account of accounts) await request.delete('/api/users/me', { headers: { Authorization: `Bearer ${account.token}` } })
  }
})

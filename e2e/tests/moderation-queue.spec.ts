import { test, expect } from '@playwright/test'
import { MongoClient, ObjectId } from 'mongodb'
import { io, type Socket } from 'socket.io-client'

test('assigned moderator removes a reported message through the queue', async ({ page, request, baseURL }) => {
  // Privileged fixtures are permitted only in this explicitly isolated local DB.
  test.skip(process.env.MONGO_URI !== 'mongodb://localhost:28018/rentos_compliance_e2e', 'Requires isolated compliance database')
  const client = new MongoClient(process.env.MONGO_URI!)
  await client.connect()
  const db = client.db()
  const accounts = []
  const sockets: Socket[] = []
  const suffix = Date.now()
  let reportId: string | undefined
  const extraReports: ObjectId[] = []
  try {
    for (const name of ['Moderator', 'OtherModerator', 'Reporter', 'Sender', 'SuperModerator']) {
      const email = `${name}-${suffix}@rentos.test`
      const registered = await request.post('/api/auth/register', { data: { email, phone: '0241234567', password: 'E2e!Password123', firstName: name, lastName: String(suffix), role: 'tenant' } })
      expect(registered.status()).toBe(201)
      let data = (await registered.json()).data
      if (name.includes('Moderator')) {
        const role = name === 'SuperModerator' ? 'super_admin' : 'admin'
        await db.collection('users').updateOne({ _id: new ObjectId(data.user.id), email: email.toLowerCase() }, { $set: { roles: [role], activeRole: role } })
        const login = await request.post('/api/auth/login', { data: { email, password: 'E2e!Password123' } })
        expect(login.status()).toBe(200)
        data = (await login.json()).data
      }
      accounts.push(data)
    }
    const [moderator, otherModerator, reporter, sender] = accounts
    const headers = (account: typeof moderator) => ({ Authorization: `Bearer ${account.token}` })
    const created = await request.post('/api/chat/conversations', { headers: headers(sender), data: { participantId: reporter.user.id } })
    const conversationId = (await created.json()).data.id
    const content = `Moderation fixture ${suffix}`
    const sent = await request.post(`/api/chat/conversations/${conversationId}/messages`, { headers: headers(sender), data: { text: content } })
    const messageId = (await sent.json()).data.id
    const reported = await request.post('/api/reports', { headers: headers(reporter), data: { targetType: 'message', targetId: messageId, reason: 'offensive_content' } })
    expect(reported.status()).toBe(201)
    reportId = (await reported.json()).data.id
    const resolution = { action: 'content_removed', note: 'Confirmed abusive message in test fixture' }
    expect((await request.get('/api/reports/admin/queue', { headers: headers(reporter) })).status()).toBe(403)
    expect((await request.post(`/api/reports/admin/${reportId}/resolve`, { headers: headers(moderator), data: resolution })).status()).toBe(409)
    await page.addInitScript(data => localStorage.setItem('rentos-auth', JSON.stringify({ state: { ...data, isAuthenticated: true }, version: 0 })), moderator)
    await page.goto('/admin/content-reports')
    await page.getByRole('button', { name: 'Skip tour', exact: true }).click()
    const card = page.getByText(content, { exact: true }).locator('..')
    await card.getByRole('button', { name: 'Claim report' }).click()
    expect((await request.post(`/api/reports/admin/${reportId}/release`, { headers: headers(otherModerator) })).status()).toBe(409)
    expect((await request.post(`/api/reports/admin/${reportId}/release`, { headers: headers(moderator) })).status()).toBe(200)
    await page.reload()
    await page.getByText(content, { exact: true }).locator('..').getByRole('button', { name: 'Claim report' }).click()
    expect((await request.post(`/api/reports/admin/${reportId}/resolve`, { headers: headers(otherModerator), data: resolution })).status()).toBe(409)
    await page.getByLabel('Moderation decision').selectOption('content_removed')
    await page.getByLabel('Decision reason').fill(resolution.note)
    await page.getByRole('button', { name: 'Save decision' }).click()
    await expect(page.getByLabel('Decision reason')).toHaveCount(0)
    await page.getByLabel('Report status').selectOption('actioned')
    await expect(page.getByText(`Decision: content_removed — ${resolution.note}`, { exact: true })).toBeVisible()
    const history = (await (await request.get(`/api/chat/conversations/${conversationId}/messages`, { headers: headers(reporter) })).json()).data
    expect(history.items.find((message: { id: string }) => message.id === messageId).text).toBe('Message removed by moderation')
    expect((await request.post(`/api/reports/admin/${reportId}/resolve`, { headers: headers(moderator), data: resolution })).status()).toBe(409)

    async function newClaimedReport(text: string) {
      const sent = await request.post(`/api/chat/conversations/${conversationId}/messages`, { headers: headers(sender), data: { text } })
      const messageId = (await sent.json()).data.id
      const reported = await request.post('/api/reports', { headers: headers(reporter), data: { targetType: 'message', targetId: messageId, reason: 'offensive_content' } })
      expect(reported.status()).toBe(201)
      const id = (await reported.json()).data.id
      extraReports.push(new ObjectId(id))
      expect((await request.post(`/api/reports/admin/${id}/claim`, { headers: headers(moderator) })).status()).toBe(200)
      return id
    }
    const racingId = await newClaimedReport(`Concurrent decision ${suffix}`)
    const results = await Promise.all([
      request.post(`/api/reports/admin/${racingId}/resolve`, { headers: headers(moderator), data: { action: 'none', note: 'Dismissal contender' } }),
      request.post(`/api/reports/admin/${racingId}/resolve`, { headers: headers(moderator), data: { action: 'content_removed', note: 'Removal contender' } }),
    ])
    expect(results.map(result => result.status()).sort()).toEqual([200, 409])
    const winner = await db.collection('contentreports').findOne({ _id: new ObjectId(racingId) })
    expect(winner?.action).toBe(results[0].status() === 200 ? 'none' : 'content_removed')
    const retryId = await newClaimedReport(`Interrupted removal ${suffix}`)
    // Simulate a crash after the durable decision is recorded, before removal.
    await db.collection('contentreports').updateOne({ _id: new ObjectId(retryId) }, { $set: { pendingAction: 'content_removed', pendingNote: 'Saved removal' } })
    expect((await request.post(`/api/reports/admin/${retryId}/release`, { headers: headers(moderator) })).status()).toBe(409)
    expect((await request.post(`/api/reports/admin/${retryId}/resolve`, { headers: headers(moderator), data: { action: 'none', note: 'Conflicting decision' } })).status()).toBe(409)
    expect((await request.post(`/api/reports/admin/${retryId}/resolve`, { headers: headers(moderator), data: { action: 'content_removed', note: 'Saved removal' } })).status()).toBe(200)
    const takeoverText = `Abandoned decision ${suffix}`
    const takeoverId = await newClaimedReport(takeoverText)
    await db.collection('contentreports').updateOne({ _id: new ObjectId(takeoverId) }, { $set: { pendingAction: 'content_removed', pendingNote: 'Preserve this decision' } })
    expect((await request.post(`/api/reports/admin/${takeoverId}/takeover`, { headers: headers(otherModerator) })).status()).toBe(403)
    const superContext = await page.context().browser()!.newContext()
    try {
      const superPage = await superContext.newPage()
      await superPage.addInitScript(data => localStorage.setItem('rentos-auth', JSON.stringify({ state: { ...data, isAuthenticated: true }, version: 0 })), accounts[4])
      await superPage.goto(new URL('/admin/content-reports', page.url()).href)
      await superPage.getByRole('button', { name: 'Skip tour', exact: true }).click()
      const recoveryCard = superPage.getByText(takeoverText, { exact: true }).locator('..')
      await recoveryCard.getByRole('button', { name: 'Take over claim' }).click()
      await recoveryCard.getByRole('button', { name: 'Review report' }).click()
      await expect(superPage.getByLabel('Decision reason')).toHaveValue('Preserve this decision')
      await expect(superPage.getByLabel('Decision reason')).toBeDisabled()
      await expect(superPage.getByLabel('Moderation decision')).toBeDisabled()
      expect((await request.post(`/api/reports/admin/${takeoverId}/resolve`, { headers: headers(moderator), data: { action: 'content_removed', note: 'Preserve this decision' } })).status()).toBe(409)
      await superPage.getByRole('button', { name: 'Save decision' }).click()
      await expect(superPage.getByLabel('Decision reason')).toHaveCount(0)
      const recovered = await db.collection('contentreports').findOne({ _id: new ObjectId(takeoverId) })
      expect(recovered?.status).toBe('actioned')
      expect(recovered?.handledBy).toBe(accounts[4].user.id)
    } finally { await superContext.close() }
    const accountReport = await request.post('/api/reports', { headers: headers(reporter), data: { targetType: 'user', targetId: sender.user.id, reason: 'spam' } })
    expect(accountReport.status()).toBe(201)
    const accountReportId = (await accountReport.json()).data.id
    extraReports.push(new ObjectId(accountReportId))
    await page.goto('/admin/content-reports')
    const accountCard = page.getByText(`Sender ${suffix}`, { exact: true }).locator('..')
    await accountCard.getByRole('button', { name: 'Claim report' }).click()
    await page.getByLabel('Moderation decision').selectOption('account_suspended')
    await page.getByLabel('Decision reason').fill('Repeated abusive contact in fixture')
    const senderSocket = io(baseURL!, { auth: { token: sender.token }, transports: ['websocket'], reconnection: false })
    sockets.push(senderSocket)
    await expect.poll(() => senderSocket.connected).toBe(true)
    let disconnectReason = ''
    senderSocket.on('disconnect', reason => { disconnectReason = reason })
    await page.getByRole('button', { name: 'Save decision' }).click()
    await expect(page.getByLabel('Decision reason')).toHaveCount(0)
    await expect.poll(() => disconnectReason).toBe('io server disconnect')
    let socketRejection = ''
    senderSocket.on('connect_error', error => { socketRejection = error.message })
    senderSocket.connect()
    await expect.poll(() => socketRejection).toBe('Invalid token')
    expect((await request.get('/api/chat/conversations', { headers: headers(sender) })).status()).toBe(403)
    expect((await request.post(`/api/chat/conversations/${conversationId}/messages`, { headers: headers(sender), data: { text: 'Suspension must prevent this' } })).status()).toBe(403)
    expect((await request.get('/api/users/me', { headers: headers(sender) })).status()).toBe(200)
    expect((await request.get('/api/users/me/export', { headers: headers(sender) })).status()).toBe(200)
    const suspendedLogin = await request.post('/api/auth/login', { data: { email: sender.user.email, password: 'E2e!Password123' } })
    expect(suspendedLogin.status()).toBe(200)
    const suspendedSession = (await suspendedLogin.json()).data
    expect(suspendedSession.user.suspendedAt).toBeTruthy()
    expect((await request.get('/api/chat/conversations', { headers: headers(suspendedSession) })).status()).toBe(403)
    await page.getByLabel('Report status').selectOption('actioned')
    await page.getByText(`Sender ${suffix}`, { exact: true }).locator('..').getByRole('button', { name: 'Restore account access' }).click()
    await page.getByLabel('Decision reason').fill('Appeal reviewed, restore test account')
    await page.getByRole('button', { name: 'Save decision' }).click()
    await expect(page.getByLabel('Decision reason')).toHaveCount(0)
    expect((await request.get('/api/chat/conversations', { headers: headers(sender) })).status()).toBe(200)
    expect((await request.post(`/api/reports/admin/${accountReportId}/restore-account`, { headers: headers(moderator), data: { note: 'Stale restoration' } })).status()).toBe(409)
    // A separate suspension must retain self-service account deletion.
    await db.collection('users').updateOne({ _id: new ObjectId(sender.user.id) }, { $set: { suspendedAt: new Date(), suspensionReason: 'Deletion eligibility fixture' } })
    expect((await request.delete('/api/users/me', { headers: headers(sender) })).status()).toBe(200)
  } finally {
    for (const socket of sockets) socket.disconnect()
    if (reportId) await db.collection('contentreports').deleteOne({ _id: new ObjectId(reportId) })
    if (extraReports.length) await db.collection('contentreports').deleteMany({ _id: { $in: extraReports } })
    for (const account of accounts) await request.delete('/api/users/me', { headers: { Authorization: `Bearer ${account.token}` } })
    await client.close()
  }
})

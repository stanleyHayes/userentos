import { test, expect } from '@playwright/test'

test('web block prevents contact in both directions and only its owner can remove it', async ({ page, request }) => {
  const suffix = `${Date.now()}`
  const accounts = []
  for (const firstName of ['BlockOwner', 'BlockTarget', 'ReportOutsider']) {
    const response = await request.post('/api/auth/register', { data: { email: `${firstName}-${suffix}@rentos.test`, phone: '0241234567', password: 'E2e!Password123', firstName, lastName: suffix, role: 'tenant' } })
    expect(response.status()).toBe(201)
    accounts.push((await response.json()).data)
  }
  const [owner, target] = accounts
  const ownerHeaders = { Authorization: `Bearer ${owner.token}` }
  const targetHeaders = { Authorization: `Bearer ${target.token}` }
  try {
    const created = await request.post('/api/chat/conversations', { headers: ownerHeaders, data: { participantId: target.user.id } })
    expect(created.status()).toBe(201)
    const conversation = (await created.json()).data
    const messagesUrl = `/api/chat/conversations/${conversation.id}/messages`
    expect((await request.post(messagesUrl, { headers: ownerHeaders, data: { text: 'Existing history remains accessible' } })).status()).toBe(201)
    await page.addInitScript(data => localStorage.setItem('rentos-auth', JSON.stringify({ state: { ...data, isAuthenticated: true }, version: 0 })), owner)
    await page.goto(`/messages?conversationId=${conversation.id}`)
    await page.getByRole('button', { name: 'Skip tour', exact: true }).click()
    await page.getByRole('button', { name: 'Block user', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Unblock user', exact: true })).toBeVisible()
    await expect(page.getByPlaceholder('Type a message...')).toBeDisabled()
    const exported = (await (await request.get('/api/users/me/export', { headers: ownerHeaders })).json()).data
    expect(exported.blockedUsers.map((block: { blockedId: string }) => block.blockedId)).toContain(target.user.id)
    for (const headers of [ownerHeaders, targetHeaders]) {
      expect((await request.post(messagesUrl, { headers, data: { text: 'Must be blocked' } })).status()).toBe(403)
    }
    expect((await request.post('/api/chat/conversations', { headers: targetHeaders, data: { participantId: owner.user.id } })).status()).toBe(403)
    const found = await request.get(`/api/chat/users?search=BlockOwner`, { headers: targetHeaders })
    expect((await found.json()).data.items.some((item: { id: string }) => item.id === owner.user.id)).toBe(false)
    // The recipient cannot remove the block placed by the owner.
    expect((await request.delete(`/api/chat/blocks/${owner.user.id}`, { headers: targetHeaders })).status()).toBe(200)
    expect((await request.post(messagesUrl, { headers: targetHeaders, data: { text: 'Still blocked' } })).status()).toBe(403)
    const history = (await (await request.get(messagesUrl, { headers: ownerHeaders })).json()).data
    expect(history.total).toBe(1)
    await page.getByRole('button', { name: 'Unblock user', exact: true }).click()
    await expect(page.getByPlaceholder('Type a message...')).toBeEnabled()
    const incoming = await request.post(messagesUrl, { headers: targetHeaders, data: { text: 'Contact restored' } })
    expect(incoming.status()).toBe(201)
    const message = (await incoming.json()).data
    await expect(page.getByText('Contact restored', { exact: true }).first()).toBeVisible()
    const reportBody = { targetType: 'message', targetId: message.id, reason: 'offensive_content' }
    expect((await request.post('/api/reports', { headers: { Authorization: `Bearer ${accounts[2].token}` }, data: reportBody })).status()).toBe(404)
    expect((await request.post('/api/reports', { headers: targetHeaders, data: reportBody })).status()).toBe(422)
    await page.getByRole('button', { name: 'Report message', exact: true }).click()
    await page.getByLabel('Report details').fill('Please review this message')
    await page.getByRole('button', { name: 'Submit report', exact: true }).click()
    await expect(page.getByText('Report received for moderation review.', { exact: true })).toBeVisible()
    const mine = (await (await request.get('/api/reports/mine', { headers: ownerHeaders })).json()).data.items
    expect(mine.some((report: { targetId: string }) => report.targetId === message.id)).toBe(true)
    expect((await request.post('/api/reports', { headers: ownerHeaders, data: reportBody })).status()).toBe(409)
    // Independent reciprocal blocks remain in force until each owner removes theirs.
    await request.put(`/api/chat/blocks/${target.user.id}`, { headers: ownerHeaders })
    await request.put(`/api/chat/blocks/${owner.user.id}`, { headers: targetHeaders })
    await request.delete(`/api/chat/blocks/${target.user.id}`, { headers: ownerHeaders })
    expect((await request.post(messagesUrl, { headers: ownerHeaders, data: { text: 'Other block remains' } })).status()).toBe(403)
  } finally {
    for (const data of accounts) await request.delete('/api/users/me', { headers: { Authorization: `Bearer ${data.token}` } })
  }
})

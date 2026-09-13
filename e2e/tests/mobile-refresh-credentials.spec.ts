import { test, expect } from '@playwright/test'
import { requestRefreshCredentials } from '../../apps/mobile/lib/refreshCredentials'
import { createSessionRequests } from '../../apps/mobile/lib/sessionRequests'
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
for (const kind of ['network', 'server', 'rate limit', 'invalid JSON', 'missing rotation', 'wrong token type']) test(`mobile ${kind} refresh failure preserves the login`, async () => {
  let loggedOut = 0
  const transport = async () => {
    if (kind === 'network') throw new Error('Network unavailable')
    if (kind === 'server') return json({}, 503)
    if (kind === 'rate limit') return json({}, 429)
    if (kind === 'invalid JSON') return new Response('not JSON')
    if (kind === 'missing rotation') return json({ data: { token: 'access' } })
    return json({ data: { token: {}, refreshToken: 'refresh' } })
  }
  const request = createSessionRequests({
    session: () => ({ version: 1, token: 'original' }),
    refresh: async () => !!await requestRefreshCredentials(transport),
    logout: () => { loggedOut++ },
  })
  await expect(request(async () => new Response('', { status: 401 }), true)).rejects.toThrow()
  expect(loggedOut).toBe(0)
})
for (const status of [401, 403]) test(`mobile refresh rejection ${status} invalidates the same login`, async () => {
  let loggedOut = 0
  const request = createSessionRequests({ session: () => ({ version: 1, token: 'original' }), refresh: async () => !!await requestRefreshCredentials(async () => json({}, status)), logout: () => { loggedOut++ } })
  await expect(request(async () => json({}, 401), true)).rejects.toThrow('Session expired')
  expect(loggedOut).toBe(1)
})
test('mobile refresh returns a validated rotating credential pair', async () => {
  expect(await requestRefreshCredentials(async signal => {
    expect(signal.aborted).toBe(false)
    return json({ data: { token: 'next-access', refreshToken: 'next-refresh' } })
  })).toEqual({ token: 'next-access', refreshToken: 'next-refresh' })
})
test('mobile refresh aborts a stalled request without logging out', async () => {
  let loggedOut = 0
  const request = createSessionRequests({
    session: () => ({ version: 1, token: 'original' }),
    refresh: async () => !!await requestRefreshCredentials(signal => new Promise<Response>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('Refresh timed out')), { once: true })
    })),
    logout: () => { loggedOut++ },
  })
  await expect(request(async () => json({}, 401), true)).rejects.toThrow('Refresh timed out')
  expect(loggedOut).toBe(0)
})

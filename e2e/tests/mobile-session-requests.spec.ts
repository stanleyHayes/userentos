import { test, expect } from '@playwright/test'
import { createSessionRequests } from '../../apps/mobile/lib/sessionRequests.js'
const ok = () => new Response(JSON.stringify({ data: 'ok' }), { status: 200 })
const unauthorized = () => new Response('', { status: 401 })
test('a stale 401 cannot refresh or log out a newly signed-in account', async () => {
  let version = 1
  let refreshed = 0
  let loggedOut = 0
  const request = createSessionRequests({ session: () => ({ version, token: `token-${version}` }), refresh: async () => { refreshed++; return true }, logout: () => { loggedOut++ } })
  await expect(request(async () => { version++; return unauthorized() }, true)).rejects.toThrow('session changed')
  expect(refreshed).toBe(0)
  expect(loggedOut).toBe(0)
})
test('an account change during refresh prevents retry under the new token', async () => {
  let version = 1
  const tokens: (string | null)[] = []
  const request = createSessionRequests({ session: () => ({ version, token: `token-${version}` }), refresh: async () => { version++; return true }, logout: () => {} })
  await expect(request(async token => { tokens.push(token); return unauthorized() }, true)).rejects.toThrow('session changed')
  expect(tokens).toEqual(['token-1'])
})
test('concurrent requests share one refresh in their session and retry the rotated token', async () => {
  let token = 'old'
  let refreshes = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const request = createSessionRequests({ session: () => ({ version: 1, token }), refresh: async () => { refreshes++; await gate; token = 'rotated'; return true }, logout: () => {} })
  const send = async (value: string | null) => value === 'old' ? unauthorized() : ok()
  const a = request(send, true); const b = request(send, true)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(refreshes).toBe(1)
  release()
  expect(await Promise.all([a, b])).toEqual(['ok', 'ok'])
})
test('new sessions do not share an old session refresh promise', async () => {
  let version = 1
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const request = createSessionRequests({ session: () => ({ version, token: `token-${version}` }), refresh: async origin => { if (origin === 1) await gate; return true }, logout: () => {} })
  const old = request(async () => unauthorized(), true)
  const oldCheck = expect(old).rejects.toThrow('session changed')
  await new Promise(resolve => setTimeout(resolve, 0)); version = 2
  let calls = 0
  expect(await request(async () => ++calls === 1 ? unauthorized() : ok(), true)).toBe('ok')
  release(); await oldCheck
})
test('late successful response bodies are not delivered to a replacement session', async () => {
  let version = 1
  const request = createSessionRequests({ session: () => ({ version, token: 'token' }), refresh: async () => false, logout: () => {} })
  await expect(request(async () => ({ ok: true, status: 200, text: async () => { version++; return '{"data":"private"}' } }) as Response, false)).rejects.toThrow('session changed')
})
test('a delayed old-token 401 reuses credentials already rotated by another request', async () => {
  let token = 'old', refreshes = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const request = createSessionRequests({ session: () => ({ version: 1, token }), refresh: async () => { refreshes++; token = 'rotated'; return true }, logout: () => {} })
  const seen: (string | null)[] = []
  const delayed = request(async value => {
    seen.push(value)
    if (value === 'old') { await gate; return unauthorized() }
    return ok()
  }, true)
  expect(await request(async value => value === 'old' ? unauthorized() : ok(), true)).toBe('ok')
  release()
  expect(await delayed).toBe('ok')
  expect(seen).toEqual(['old', 'rotated'])
  expect(refreshes).toBe(1)
})
test('a transient refresh failure releases its slot for a later retry', async () => {
  let token = 'old', refreshes = 0, logouts = 0
  const request = createSessionRequests({ session: () => ({ version: 1, token }), refresh: async () => { if (++refreshes === 1) throw new Error('offline'); token = 'rotated'; return true }, logout: () => { logouts++ } })
  const send = async (value: string | null) => value === 'old' ? unauthorized() : ok()
  await expect(request(send, true)).rejects.toThrow('offline')
  expect(await request(send, true)).toBe('ok')
  expect(refreshes).toBe(2)
  expect(logouts).toBe(0)
})
test('a 401 during a password change waits for the renewed pair instead of refreshing or signing out', async () => {
  let token = 'before-change', refreshes = 0, loggedOut = 0
  let finishChange!: () => void
  const change = new Promise<void>(resolve => { finishChange = () => { token = 'renewed'; resolve() } })
  const request = createSessionRequests({
    session: () => ({ version: 1, token }),
    refresh: async () => { refreshes++; return false },
    logout: () => { loggedOut++ },
    pendingCredentialChange: () => change,
  })
  const seen: (string | null)[] = []
  const racing = request(async value => { seen.push(value); return value === 'renewed' ? ok() : unauthorized() }, true)
  await new Promise(resolve => setTimeout(resolve, 0))
  finishChange()
  expect(await racing).toBe('ok')
  expect(seen).toEqual(['before-change', 'renewed'])
  expect(refreshes).toBe(0)
  expect(loggedOut).toBe(0)
})

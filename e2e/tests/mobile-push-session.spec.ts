import { test, expect } from '@playwright/test'
import { registerSessionPush, rememberRegisteredPushToken, takeRegisteredPushToken } from '../../apps/mobile/lib/pushSession'
import { signOutDevice } from '../../apps/mobile/lib/signOut'

test.describe('sign-out removes this phone push registration', () => {
  test.beforeEach(() => { takeRegisteredPushToken() })

  test('the logout request carries the registered push token and starts before the session is cleared', async () => {
    rememberRegisteredPushToken('ExponentPushToken[phone]')
    const calls: string[] = []
    signOutDevice({
      refreshToken: 'refresh-1',
      takePushToken: takeRegisteredPushToken,
      post: async (path, body) => { calls.push(`${path} ${JSON.stringify(body)}`) },
      clearSession: () => { calls.push('clear') },
    })
    expect(calls).toEqual(['/auth/logout {"refreshToken":"refresh-1","pushToken":"ExponentPushToken[phone]"}', 'clear'])
    // One sign-out uses it; the next account registers its own.
    expect(takeRegisteredPushToken()).toBeNull()
  })

  test('without a registered token the logout sends only the refresh token', () => {
    const bodies: Record<string, string>[] = []
    signOutDevice({ refreshToken: 'refresh-1', takePushToken: takeRegisteredPushToken, post: async (_path, body) => { bodies.push(body) }, clearSession: () => {} })
    expect(bodies).toEqual([{ refreshToken: 'refresh-1' }])
  })

  test('a session without a refresh token unregisters the push token with the still-valid bearer', () => {
    rememberRegisteredPushToken('ExponentPushToken[phone]')
    const calls: string[] = []
    signOutDevice({ refreshToken: null, takePushToken: takeRegisteredPushToken, post: async (path, body) => { calls.push(`${path} ${body.token}`) }, clearSession: () => { calls.push('clear') } })
    expect(calls).toEqual(['/push/unregister ExponentPushToken[phone]', 'clear'])
  })

  test('an offline phone still signs out locally', async () => {
    let cleared = false
    signOutDevice({ refreshToken: 'refresh-1', takePushToken: () => 'token', post: async () => { throw new Error('offline') }, clearSession: () => { cleared = true } })
    expect(cleared).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 0))
  })
})

for (const stop of ['logout', 'effect cleanup']) test(`push token acquisition finishing after ${stop} cannot register`, async () => {
  let active = true
  let release!: (token: string) => void
  const pending = new Promise<string>(resolve => { release = resolve })
  const registered: string[] = []
  const result = registerSessionPush(() => active, () => pending, async token => { registered.push(token) })
  active = false
  release('fixture-device-token')
  expect(await result).toBeNull()
  expect(registered).toEqual([])
})

test('a sign-out while the register request is in flight still carries the push token', async () => {
  takeRegisteredPushToken()
  let answer!: () => void
  const registering = new Promise<void>(resolve => { answer = resolve })
  let sent!: () => void
  const requestSent = new Promise<void>(resolve => { sent = resolve })
  let active = true
  const result = registerSessionPush(() => active, async () => 'ExponentPushToken[phone]', () => { sent(); return registering }, rememberRegisteredPushToken)
  await requestSent
  // The user taps Logout before /push/register has answered.
  const bodies: Record<string, string>[] = []
  signOutDevice({ refreshToken: 'refresh-1', takePushToken: takeRegisteredPushToken, post: async (_path, body) => { bodies.push(body) }, clearSession: () => { active = false } })
  answer()
  expect(await result).toBeNull()
  expect(bodies).toEqual([{ refreshToken: 'refresh-1', pushToken: 'ExponentPushToken[phone]' }])
})

test('a token the OS returns after sign-out is never remembered', async () => {
  takeRegisteredPushToken()
  let active = true
  let release!: (token: string) => void
  const acquiring = new Promise<string>(resolve => { release = resolve })
  const result = registerSessionPush(() => active, () => acquiring, async () => {}, rememberRegisteredPushToken)
  active = false
  release('ExponentPushToken[late]')
  expect(await result).toBeNull()
  expect(takeRegisteredPushToken()).toBeNull()
})

test('push registration errors are contained and not reported as successful enrollment', async () => {
  expect(await registerSessionPush(() => true, async () => { throw new Error('OS unavailable') }, async () => {})).toBeNull()
  expect(await registerSessionPush(() => true, async () => 'fixture-token', async () => { throw new Error('Server unavailable') })).toBeNull()
})

test('push enrollment reports only a current acknowledged registration', async () => {
  let active = true
  const tokens: string[] = []
  expect(await registerSessionPush(() => active, async () => 'current-token', async token => { tokens.push(token) })).toBe('current-token')
  expect(tokens).toEqual(['current-token'])
  expect(await registerSessionPush(() => active, async () => 'late-token', async () => { active = false })).toBeNull()
})

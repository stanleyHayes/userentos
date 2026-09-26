import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PROFILE_WAIT_MS, restoreProfile } from '../../apps/mobile/lib/sessionRestore'
import { createBiometricAutoPrompt } from '../../apps/mobile/lib/biometricAutoPrompt'
import { createAuthStore, type User } from '../../apps/mobile/lib/authState'
import { querySessionKey } from '../../apps/mobile/lib/sessionQueryClient'
import { serializeSession } from '../../apps/mobile/lib/sessionRecord'

// Pure contract checks; no Expo web needed. The keychain keeps only the
// account id and credentials, so a cold start fetches the profile.
type Profile = { id: string; activeRole: string }
const instant = () => Promise.resolve()

test.describe('restoring the profile of a stored session', () => {
  test('a prompt answer opens the app with the profile', async () => {
    const applied: Profile[] = []
    const outcome = await restoreProfile<Profile>({ userId: 'u1', load: async () => ({ id: 'u1', activeRole: 'landlord' }), current: () => true, apply: user => { applied.push(user) } })
    expect(outcome).toBe('loaded')
    expect(applied).toEqual([{ id: 'u1', activeRole: 'landlord' }])
  })

  test('offline, the app opens without it and keeps asking until the profile arrives', async () => {
    const applied: Profile[] = []
    let calls = 0
    let current = true
    const outcome = await restoreProfile<Profile>({
      userId: 'u1',
      load: async () => { calls++; if (calls < 3) throw new TypeError('Network request failed'); return { id: 'u1', activeRole: 'tenant' } },
      current: () => current,
      apply: user => { applied.push(user); current = false },
      sleep: instant,
    })
    expect(outcome).toBe('pending')
    await expect.poll(() => applied).toEqual([{ id: 'u1', activeRole: 'tenant' }])
    expect(calls).toBe(3)
  })

  test('a slow first answer past the time limit is still used', async () => {
    let answer!: (profile: Profile) => void
    const applied: Profile[] = []
    let timeLimit!: () => void
    const outcome = restoreProfile<Profile>({
      userId: 'u1',
      load: () => new Promise(resolve => { answer = resolve }),
      current: () => applied.length === 0,
      apply: user => { applied.push(user) },
      sleep: ms => ms === PROFILE_WAIT_MS ? new Promise(resolve => { timeLimit = resolve }) : new Promise(() => {}),
    })
    timeLimit()
    expect(await outcome).toBe('pending')
    answer({ id: 'u1', activeRole: 'tenant' })
    await expect.poll(() => applied.length).toBe(1)
  })

  test('a sign-out while loading ends it; nothing is applied', async () => {
    let current = true
    const applied: Profile[] = []
    const outcome = await restoreProfile<Profile>({ userId: 'u1', load: async () => { current = false; throw new Error('Session expired') }, current: () => current, apply: user => { applied.push(user) }, sleep: instant })
    expect(outcome).toBe('ended')
    expect(applied).toEqual([])
  })

  test('a profile for another account is never applied', async () => {
    const applied: Profile[] = []
    let calls = 0
    const outcome = await restoreProfile<Profile>({ userId: 'u1', load: async () => { calls++; return { id: 'someone-else', activeRole: 'admin' } }, current: () => calls < 3, apply: user => { applied.push(user) }, sleep: instant })
    expect(outcome).toBe('pending')
    await expect.poll(() => calls).toBe(3)
    expect(applied).toEqual([])
  })
})

test.describe('Face ID is offered on its own only on a cold start', () => {
  test('the first login screen of a cold start prompts; a remount does not', () => {
    const prompt = createBiometricAutoPrompt()
    expect(prompt.take()).toBe(true)
    // A cancelled prompt, or coming back from the register screen.
    expect(prompt.take()).toBe(false)
  })

  test('once a session was active (restored at launch, or signed in), the login screen after a sign-out never prompts', () => {
    const prompt = createBiometricAutoPrompt()
    // authStore calls this when a session becomes active.
    prompt.suppress()
    expect(prompt.take()).toBe(false)
  })

  test('the login screen auto-prompts only when takeBiometricAutoPrompt() allows it', () => {
    const source = readFileSync(resolve(__dirname, '../../apps/mobile/app/auth/login.tsx'), 'utf8')
    // The one silent (auto) biometric sign-in, and it sits behind the gate.
    expect(source.match(/runBiometricLogin\(true\)/g)).toHaveLength(1)
    expect(source).toMatch(/if \([^)]*takeBiometricAutoPrompt\(\)\) \{\s*void runBiometricLogin\(true\)/)
  })
})

const profile: User = { id: 'u1', email: 'ama@rentos.test', phone: '0241234567', firstName: 'Ama', lastName: 'Mensah', roles: ['landlord', 'tenant'], activeRole: 'landlord', isVerified: true }
const stored = serializeSession({ userId: 'u1', token: 'access-1', refreshToken: 'refresh-1', biometricSession: false })

/** The app's auth store over an in-memory keychain, with its own Face ID gate. */
function authFixture(keychain: string | null = null) {
  const prompt = createBiometricAutoPrompt()
  const data = new Map<string, string>(keychain ? [['session', keychain]] : [])
  const retry: Array<() => void> = []
  const store = createAuthStore({
    storage: {
      getItemAsync: async name => data.get(name) ?? null,
      setItemAsync: async (name, value) => { data.set(name, value) },
      deleteItemAsync: async name => { data.delete(name) },
    },
    resetNotifications: () => {},
    sessionActive: prompt.suppress,
    // The splash wait ends at once; each background retry waits for release().
    restoreTiming: { sleep: ms => ms === PROFILE_WAIT_MS ? Promise.resolve() : new Promise(resolve => { retry.push(resolve) }) },
  })
  return { store, prompt, data, retryNow: () => retry.splice(0).forEach(release => release()) }
}
const key = (store: ReturnType<typeof authFixture>['store']) => querySessionKey(store.getState())

test.describe('the auth store and the Face ID auto-prompt', () => {
  test('signing in suppresses it for the rest of the process', () => {
    const { store, prompt } = authFixture()
    store.getState().login(profile, 'access-1', 'refresh-1')
    store.getState().logout()
    expect(prompt.take()).toBe(false)
  })

  test('a restored session suppresses it', async () => {
    const { store, prompt } = authFixture(stored)
    await store.getState().hydrate(async () => profile)
    expect(store.getState()).toMatchObject({ isAuthenticated: true, profilePending: false, user: profile })
    expect(prompt.take()).toBe(false)
  })

  test('a restore that ends in a sign-out leaves it for the login screen', async () => {
    const { store, prompt } = authFixture(stored)
    // The api client signs out when the stored refresh token is refused.
    await store.getState().hydrate(async () => { store.getState().logout(); throw new Error('Session expired') })
    expect(store.getState()).toMatchObject({ isAuthenticated: false, hydrated: true })
    expect(prompt.take()).toBe(true)
  })

  test('with no stored session it is left for the login screen', async () => {
    const { store, prompt } = authFixture()
    await store.getState().hydrate(async () => profile)
    expect(store.getState().isAuthenticated).toBe(false)
    expect(prompt.take()).toBe(true)
  })
})

test.describe('a cold start that opens before the profile loads', () => {
  test('opens with a stand-in, and the profile arriving does not remount the screens', async () => {
    const { store, prompt, retryNow } = authFixture(stored)
    let online = false
    await store.getState().hydrate(async () => { if (!online) throw new TypeError('Network request failed'); return profile })
    expect(store.getState()).toMatchObject({ isAuthenticated: true, profilePending: true, user: { id: 'u1', roles: [], activeRole: '' } })
    expect(prompt.take()).toBe(false)
    const opened = key(store)
    online = true
    retryNow()
    await expect.poll(() => store.getState().profilePending).toBe(false)
    expect(store.getState().user).toEqual(profile)
    expect(key(store)).toBe(opened)
  })

  test('the profile a foreground refresh brings replaces the stand-in the same way, and stops the retries', async () => {
    const { store, retryNow } = authFixture(stored)
    let loads = 0
    await store.getState().hydrate(async () => { loads++; throw new TypeError('Network request failed') })
    const opened = key(store)
    // useAppSocket's /users/me refresh.
    store.getState().updateUser(profile)
    expect(store.getState()).toMatchObject({ profilePending: false, user: profile })
    expect(key(store)).toBe(opened)
    const before = loads
    retryNow()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(loads).toBe(before)
  })

  test('a partial update (a suspension notice) keeps waiting for the profile', async () => {
    const { store, retryNow } = authFixture(stored)
    let online = false
    await store.getState().hydrate(async () => { if (!online) throw new TypeError('Network request failed'); return { ...profile, suspendedAt: '2026-09-26' } })
    store.getState().updateUser({ suspendedAt: '2026-09-26' })
    expect(store.getState().profilePending).toBe(true)
    online = true
    retryNow()
    await expect.poll(() => store.getState().user?.activeRole).toBe('landlord')
  })

  test('a real role change still remounts: a switch, or a refreshed profile naming another role', () => {
    const { store } = authFixture()
    store.getState().login(profile, 'access-1', 'refresh-1')
    const signedIn = key(store)
    store.getState().switchRole('landlord')
    expect(key(store)).toBe(signedIn)
    store.getState().switchRole('tenant')
    const switched = key(store)
    expect(switched).not.toBe(signedIn)
    store.getState().updateUser({ firstName: 'Ama Serwaa' })
    expect(key(store)).toBe(switched)
    store.getState().updateUser({ ...profile, activeRole: 'landlord' })
    expect(key(store)).not.toBe(switched)
  })
})

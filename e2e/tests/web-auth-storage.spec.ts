import { test, expect } from '@playwright/test'
import { AUTH_KEY, PROFILE_KEY, createAuthStorage, type PersistedAuth } from '../../apps/web/src/stores/authStorage.js'

// Contract checks for the web auth storage adapter. Each "tab" drives the
// adapter the way zustand persist does: getItem on (re)hydration, merged into
// memory, and setItem with the whole partialized state after every set().
type User = NonNullable<PersistedAuth['user']>
type StorageValue<S> = { state: S; version?: number }
const kwame = { id: 'user-1', email: 'kwame@rentos.gh', firstName: 'Kwame', lastName: 'Asante', roles: ['tenant'], activeRole: 'tenant' } as unknown as User
const signedIn = (sessionId: string, token = 'access-1', refreshToken = 'refresh-1'): Partial<PersistedAuth> => ({ user: kwame, token, refreshToken, isAuthenticated: true, sessionId })
const signedOut: Partial<PersistedAuth> = { user: null, token: null, refreshToken: null, isAuthenticated: false, sessionId: null }

function browser() {
  const shared = new Map<string, string>()
  const read = <T>(key: string): T | null => { const raw = shared.get(key); return raw === undefined ? null : JSON.parse(raw) as T }
  const tab = () => {
    const storage = createAuthStorage<PersistedAuth>(() => ({ getItem: key => shared.get(key) ?? null, setItem: (key, value) => { shared.set(key, value) }, removeItem: key => { shared.delete(key) } }))!
    let state: PersistedAuth = { user: null, token: null, refreshToken: null, isAuthenticated: false, sessionId: null }
    return {
      get state() { return state },
      hydrate() { const value = storage.getItem(AUTH_KEY) as StorageValue<PersistedAuth> | null; if (value?.state) state = { ...state, ...value.state } },
      set(patch: Partial<PersistedAuth>) { state = { ...state, ...patch }; storage.setItem(AUTH_KEY, { state, version: 0 }) },
      clear() { storage.removeItem(AUTH_KEY) },
    }
  }
  return { shared, tab, credentials: () => read<StorageValue<PersistedAuth>>(AUTH_KEY)?.state, profile: () => read<{ sessionId: string | null; user: User }>(PROFILE_KEY) }
}

test('a profile edit from a tab behind a token rotation keeps the rotated credentials', () => {
  const { tab, credentials, profile } = browser()
  const stale = tab(), rotating = tab()
  stale.set(signedIn('session-1'))
  rotating.hydrate()
  rotating.set({ token: 'access-2', refreshToken: 'refresh-2' })
  // The stale tab has not applied the rotation, like a storage event still in flight.
  stale.set({ user: { ...stale.state.user!, firstName: 'Edited here' } })
  expect(credentials()).toMatchObject({ token: 'access-2', refreshToken: 'refresh-2', sessionId: 'session-1' })
  expect(profile()).toMatchObject({ sessionId: 'session-1', user: { firstName: 'Edited here' } })
  for (const reader of [rotating, stale]) {
    reader.hydrate()
    expect(reader.state).toMatchObject({ token: 'access-2', refreshToken: 'refresh-2', user: { firstName: 'Edited here' } })
  }
})

test('a role switch from a stale tab keeps the rotated credentials', () => {
  const { tab, credentials, profile } = browser()
  const stale = tab(), rotating = tab()
  stale.set(signedIn('session-1'))
  stale.set({ user: { ...kwame, roles: ['tenant', 'landlord'] } })
  rotating.hydrate()
  rotating.set({ refreshToken: 'refresh-2' })
  stale.set({ user: { ...stale.state.user!, activeRole: 'landlord' } })
  expect(credentials()?.refreshToken).toBe('refresh-2')
  expect(profile()?.user.activeRole).toBe('landlord')
})

test("a refresh commit keeps another tab's newer profile", () => {
  const { tab, credentials } = browser()
  const refresher = tab(), editor = tab()
  refresher.set(signedIn('session-1'))
  editor.hydrate()
  editor.set({ user: { ...kwame, firstName: 'Newer' } })
  // The refresher still holds the old profile in memory when it rotates.
  refresher.set({ token: 'access-2', refreshToken: 'refresh-2' })
  expect(credentials()).toMatchObject({ token: 'access-2', user: { firstName: 'Kwame' } })
  const reader = tab()
  reader.hydrate()
  expect(reader.state).toMatchObject({ token: 'access-2', refreshToken: 'refresh-2', user: { firstName: 'Newer' } })
})

test('a write that changes neither credentials nor profile writes nothing', () => {
  const { tab, shared, profile } = browser()
  const idle = tab(), editor = tab()
  idle.set(signedIn('session-1'))
  editor.hydrate()
  editor.set({ user: { ...kwame, firstName: 'Newer' } })
  const before = new Map(shared)
  idle.set({})
  expect(new Map(shared)).toEqual(before)
  expect(profile()?.user.firstName).toBe('Newer')
})

for (const transition of ['logout', 'new login']) test(`a profile change from a tab behind a remote ${transition} is dropped`, () => {
  const { tab, credentials, profile } = browser()
  const stale = tab(), remote = tab()
  stale.set(signedIn('session-1'))
  remote.hydrate()
  remote.set(transition === 'logout' ? signedOut : signedIn('session-2', 'access-new', 'refresh-new'))
  const latest = credentials()
  stale.set({ user: { ...kwame, firstName: 'Stale profile' } })
  expect(credentials()).toEqual(latest)
  if (transition === 'logout') expect(profile()).toBeNull()
  else expect(profile()).toMatchObject({ sessionId: 'session-2', user: { firstName: 'Kwame' } })
})

test('a login writes both keys and a logout or clear removes the profile', () => {
  const { tab, shared, credentials, profile } = browser()
  const current = tab()
  current.set(signedIn('session-1'))
  expect(credentials()).toMatchObject({ isAuthenticated: true, user: { id: 'user-1' } })
  expect(profile()).toMatchObject({ sessionId: 'session-1', user: { id: 'user-1' } })
  current.set({ user: { ...kwame, firstName: 'Edited' } })
  current.set(signedOut)
  expect(credentials()).toMatchObject({ isAuthenticated: false, token: null, user: null })
  expect(profile()).toBeNull()
  current.set(signedIn('session-2'))
  current.clear()
  expect([...shared.keys()]).toEqual([])
})

test('blocked site data leaves persistence off instead of failing the import', () => {
  expect(createAuthStorage(() => { throw new DOMException('Access is denied for this document.', 'SecurityError') })).toBeUndefined()
})

test('legacy blobs, seeds and foreign or unreadable profiles fall back to the credential blob', () => {
  const { tab, shared } = browser()
  const seeded = { ...kwame, firstName: 'Seeded' }
  const reader = tab()
  reader.set({ sessionId: 'left-over' })
  // Seeds written by specs and by the previous bundle: one blob, often without a sessionId.
  shared.set(AUTH_KEY, JSON.stringify({ state: { user: seeded, token: 'seed-access', refreshToken: 'seed-refresh', isAuthenticated: true }, version: 0 }))
  reader.hydrate()
  expect(reader.state).toMatchObject({ token: 'seed-access', sessionId: null, user: { firstName: 'Seeded' } })
  for (const foreign of [{ sessionId: null, user: { ...kwame, id: 'someone-else' } }, { sessionId: 'another-session', user: kwame }]) {
    shared.set(PROFILE_KEY, JSON.stringify(foreign))
    reader.hydrate()
    expect(reader.state.user).toMatchObject({ id: 'user-1', firstName: 'Seeded' })
  }
  shared.set(PROFILE_KEY, '{unreadable')
  reader.hydrate()
  expect(reader.state.user?.firstName).toBe('Seeded')
  shared.set(PROFILE_KEY, JSON.stringify({ sessionId: null, user: { ...kwame, firstName: 'Verified' } }))
  reader.hydrate()
  expect(reader.state.user?.firstName).toBe('Verified')
})

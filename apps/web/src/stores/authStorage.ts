import type { PersistStorage, StorageValue } from 'zustand/middleware'
import type { User } from '@/types'

/**
 * Credentials and profile persist under separate keys. localStorage is
 * last-writer-wins per key, so when both lived in one blob a profile edit from
 * a tab that had not yet applied another tab's token rotation wrote the old,
 * already-rotated refresh token back, and its next use signed the account out.
 * A tab writes the credential key only when its own credentials changed (login,
 * logout, a refresh commit); profile-only changes go to the profile key.
 * `rentos-auth` keeps its full shape (user included) for legacy tabs and specs.
 */
export const AUTH_KEY = 'rentos-auth'
export const PROFILE_KEY = 'rentos-auth-profile'

export interface PersistedAuth {
  user: User | null
  token: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  sessionId: string | null
}
interface ProfileRecord { sessionId: string | null; user: User }
type SessionOwner = { sessionId?: string | null; user?: { id?: string } | null }

const credentialsOf = (state: Partial<PersistedAuth>) =>
  JSON.stringify([state.token ?? null, state.refreshToken ?? null, state.isAuthenticated ?? false, state.sessionId ?? null])

const sameSession = (record: SessionOwner | null | undefined, state: PersistedAuth) =>
  Boolean(record && (record.sessionId ?? null) === (state.sessionId ?? null) && record.user?.id !== undefined && record.user.id === state.user?.id)

/**
 * One per tab: it remembers what that tab last read from or wrote to storage.
 * Undefined when storage is unavailable (site data blocked), so persist runs
 * in memory as it did with createJSONStorage.
 */
export function createAuthStorage<S extends PersistedAuth>(getStorage: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): PersistStorage<S> | undefined {
  let storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  try {
    storage = getStorage()
  } catch {
    return undefined
  }
  // In-memory state always matches these except for a change the tab has just
  // made itself, which is how setItem tells its own changes from stale ones.
  let syncedCredentials = credentialsOf({})
  let syncedUser: User | null = null

  const readJson = <T>(key: string): T | null => {
    try {
      const raw = storage.getItem(key)
      return raw === null ? null : JSON.parse(raw) as T
    } catch {
      return null
    }
  }
  const writeProfile = (state: PersistedAuth) => {
    if (state.user) storage.setItem(PROFILE_KEY, JSON.stringify({ sessionId: state.sessionId ?? null, user: state.user } satisfies ProfileRecord))
  }

  return {
    getItem: (name) => {
      const raw = storage.getItem(name)
      if (raw === null) {
        syncedCredentials = credentialsOf({})
        syncedUser = null
        return null
      }
      const stored = JSON.parse(raw) as StorageValue<Partial<PersistedAuth>> | null
      if (!stored?.state) return stored as StorageValue<S> | null
      // Every persisted field is present so hydration leaves memory equal to storage.
      const state: PersistedAuth = {
        user: stored.state.user ?? null,
        token: stored.state.token ?? null,
        refreshToken: stored.state.refreshToken ?? null,
        isAuthenticated: stored.state.isAuthenticated ?? false,
        sessionId: stored.state.sessionId ?? null,
      }
      // A profile written for this session supersedes the copy in the credential
      // blob; a missing or foreign one (legacy state, seeds) falls back to it.
      const profile = readJson<ProfileRecord>(PROFILE_KEY)
      if (state.isAuthenticated && profile?.user && sameSession(profile, state)) state.user = profile.user
      syncedCredentials = credentialsOf(state)
      syncedUser = state.user
      return { ...stored, state: state as S }
    },
    setItem: (name, value) => {
      const state: PersistedAuth = value.state
      const credentials = credentialsOf(state)
      if (credentials !== syncedCredentials) {
        storage.setItem(name, JSON.stringify(value))
        if (!state.isAuthenticated || !state.user) storage.removeItem(PROFILE_KEY)
        else if (state.user !== syncedUser || !sameSession(readJson<ProfileRecord>(PROFILE_KEY), state)) writeProfile(state)
        syncedCredentials = credentials
      } else if (state.user !== syncedUser && state.isAuthenticated && state.user) {
        // Never let a profile change land on a session this tab has not caught up with.
        const stored = readJson<StorageValue<Partial<PersistedAuth>>>(name)?.state
        if (stored?.isAuthenticated && sameSession(stored, state)) writeProfile(state)
      }
      syncedUser = state.user
    },
    removeItem: (name) => {
      storage.removeItem(name)
      storage.removeItem(PROFILE_KEY)
      syncedCredentials = credentialsOf({})
      syncedUser = null
    },
  }
}

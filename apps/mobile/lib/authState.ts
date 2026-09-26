import { create } from 'zustand'
import { parseSession, serializeSession, type StoredSession } from './sessionRecord'
import { restoreProfile } from './sessionRestore'

export interface User {
  suspendedAt?: string
  suspensionReason?: string
  id: string
  email: string
  phone: string
  firstName: string
  lastName: string
  roles: string[]
  activeRole: string
  isVerified: boolean
}

export interface AuthState {
  sessionVersion: number
  /** Bumped when the active role of a loaded profile changes: a role switch,
   * or a refreshed profile naming another role. Filling in the profile of a
   * session that opened without one does not count, so the screen stack a
   * cold-start notification tap opened stays mounted (lib/sessionQueryClient.ts). */
  roleVersion: number
  /** The signed-in account, known before its profile has loaded. */
  userId: string | null
  user: User | null
  /** A restored session opened before its profile loaded (offline, or slower
   * than the splash waits): `user` is a stand-in with no roles until it does. */
  profilePending: boolean
  token: string | null
  refreshToken: string | null
  /** True when the session came from a biometric exchange — the 401 refresh
   * flow must then use /auth/biometric/exchange instead of /auth/refresh. */
  biometricSession: boolean
  isAuthenticated: boolean
  hydrated: boolean
  login: (user: User, token: string, refreshToken?: string, opts?: { biometricSession?: boolean }) => void
  logout: () => void
  switchRole: (role: string) => void
  updateTokens: (token: string, refreshToken: string | null) => void
  renewSession: (token: string, refreshToken: string) => void
  updateUser: (updates: Partial<User>) => void
  /** Restore the stored session; `loadUser` fetches its profile (GET /users/me). */
  hydrate: (loadUser: () => Promise<User>) => Promise<void>
}

export interface AuthStoreDependencies {
  /** The keychain (lib/credentialStorage.ts). */
  storage: {
    getItemAsync: (name: 'session') => Promise<string | null>
    setItemAsync: (name: 'session', value: string) => Promise<void>
    deleteItemAsync: (name: 'session') => Promise<void>
  }
  /** Clears the previous session's toasts and unread badge. */
  resetNotifications: () => void
  /** A session became active in this process (lib/biometricAutoPrompt.ts). */
  sessionActive: () => void
  /** The profile restore's time limit and retry timing (lib/sessionRestore.ts). */
  restoreTiming?: { timeoutMs?: number; retryDelaysMs?: readonly number[]; sleep?: (ms: number) => Promise<void> }
}

/** Stands in for the profile when a restored session opens offline, until it loads. */
function pendingProfile(id: string): User {
  return { id, email: '', phone: '', firstName: '', lastName: '', roles: [], activeRole: '', isVerified: false }
}

/** The signed-in session. stores/authStore.ts builds the app's one instance. */
export function createAuthStore(dependencies: AuthStoreDependencies) {
  const { storage, resetNotifications, sessionActive, restoreTiming } = dependencies

  /** Only the account id and credentials are persisted (lib/sessionRecord.ts). */
  function persist(session: StoredSession) {
    storage.setItemAsync('session', serializeSession(session)).catch(() => {})
  }

  return create<AuthState>()((set, get) => ({
    sessionVersion: 0,
    roleVersion: 0,
    userId: null,
    user: null,
    profilePending: false,
    token: null,
    refreshToken: null,
    biometricSession: false,
    isAuthenticated: false,
    hydrated: false,

    login: (user, token, refreshToken, opts) => {
      // A signed-in state without an identity or credential is unusable and was
      // reachable (e.g. an MFA challenge response passed through as a login).
      // Refuse it before touching the current session.
      if (!user?.id || typeof token !== 'string' || !token) throw new Error('Sign-in did not return a valid session. Please try again.')
      resetNotifications()
      // A session was active in this process: a later login screen is not a cold start.
      sessionActive()
      const biometricSession = opts?.biometricSession ?? false
      set({ userId: user.id, user, profilePending: false, token, refreshToken: refreshToken ?? null, biometricSession, isAuthenticated: true, sessionVersion: get().sessionVersion + 1 })
      persist({ userId: user.id, token, refreshToken: refreshToken ?? null, biometricSession })
    },

    logout: () => {
      resetNotifications()
      set({ userId: null, user: null, profilePending: false, token: null, refreshToken: null, biometricSession: false, isAuthenticated: false, sessionVersion: get().sessionVersion + 1 })
      storage.deleteItemAsync('session').catch(() => {})
    },

    // The profile is not persisted, so a role switch lasts until the next
    // profile refresh, as it did before.
    switchRole: (role) =>
      set((state) => {
        // Only roles the user actually holds
        if (!state.user || !state.user.roles.includes(role)) return {}
        if (state.user.activeRole === role) return {}
        return { user: { ...state.user, activeRole: role }, roleVersion: state.roleVersion + 1 }
      }),

    // Token rotation MUST go through here — a bare setState() never reaches
    // SecureStore, so the next cold start restores a revoked token and the user
    // gets force-logged-out (this was the main mobile session bug).
    updateTokens: (token, refreshToken) =>
      set((state) => {
        if (state.userId) persist({ userId: state.userId, token, refreshToken, biometricSession: state.biometricSession })
        return { token, refreshToken }
      }),

    // A password change signs every other session out and returns a fresh
    // ordinary pair for this device, replacing a biometric session too (its
    // biometric tokens were revoked with the rest).
    renewSession: (token, refreshToken) =>
      set((state) => {
        if (state.userId) persist({ userId: state.userId, token, refreshToken, biometricSession: false })
        return { token, refreshToken, biometricSession: false }
      }),

    // A profile from the server carries the account id: it replaces the
    // stand-in of a pending session without counting as a role change.
    updateUser: (updates) =>
      set((state) => {
        if (!state.user) return {}
        const user = { ...state.user, ...updates }
        if (state.profilePending) return updates.id === state.userId ? { user, profilePending: false } : { user }
        return { user, ...(user.activeRole !== state.user.activeRole ? { roleVersion: state.roleVersion + 1 } : {}) }
      }),

    hydrate: async (loadUser) => {
      const version = get().sessionVersion
      try {
        const session = parseSession(await storage.getItemAsync('session'))
        if (get().sessionVersion !== version) { set({ hydrated: true }); return }
        if (session) {
          resetNotifications()
          const restored = version + 1
          // Credentials first, so the profile request (and a refresh it
          // triggers) runs in this session; still signed out until it answers.
          set({ userId: session.userId, user: null, profilePending: false, token: session.token, refreshToken: session.refreshToken, biometricSession: session.biometricSession, sessionVersion: restored })
          const outcome = await restoreProfile({
            ...restoreTiming,
            userId: session.userId,
            load: loadUser,
            current: () => get().sessionVersion === restored && (get().user === null || get().profilePending),
            apply: (user) => set({ user, profilePending: false }),
          })
          if (outcome === 'ended' || get().sessionVersion !== restored) { set({ hydrated: true }); return }
          sessionActive()
          const loaded = get().user
          set({ user: loaded ?? pendingProfile(session.userId), profilePending: !loaded, isAuthenticated: true, hydrated: true })
          return
        }
      } catch { /* no-op */ }
      set({ hydrated: true })
    },
  }))
}

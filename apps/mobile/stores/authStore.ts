import { create } from 'zustand'
import { useNotificationStore } from './notificationStore'
import { credentialStorage } from '../lib/credentialStorage'
import { parseSession, serializeSession, type StoredSession } from '../lib/sessionRecord'
import { restoreProfile } from '../lib/sessionRestore'
import { suppressBiometricAutoPrompt } from '../lib/biometricAutoPrompt'

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

interface AuthState {
  sessionVersion: number
  /** The signed-in account, known before its profile has loaded. */
  userId: string | null
  user: User | null
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

/** Only the account id and credentials are persisted (lib/sessionRecord.ts). */
function persist(session: StoredSession) {
  credentialStorage.setItemAsync('session', serializeSession(session)).catch(() => {})
}

/** Stands in for the profile when a restored session opens offline, until it loads. */
function pendingProfile(id: string): User {
  return { id, email: '', phone: '', firstName: '', lastName: '', roles: [], activeRole: '', isVerified: false }
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  sessionVersion: 0,
  userId: null,
  user: null,
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
    useNotificationStore.getState().reset()
    // A session was active in this process: a later login screen is not a cold start.
    suppressBiometricAutoPrompt()
    const biometricSession = opts?.biometricSession ?? false
    set({ userId: user.id, user, token, refreshToken: refreshToken ?? null, biometricSession, isAuthenticated: true, sessionVersion: get().sessionVersion + 1 })
    persist({ userId: user.id, token, refreshToken: refreshToken ?? null, biometricSession })
  },

  logout: () => {
    useNotificationStore.getState().reset()
    set({ userId: null, user: null, token: null, refreshToken: null, biometricSession: false, isAuthenticated: false, sessionVersion: get().sessionVersion + 1 })
    credentialStorage.deleteItemAsync('session').catch(() => {})
  },

  // The profile is not persisted, so a role switch lasts until the next
  // profile refresh, as it did before.
  switchRole: (role) =>
    set((state) => {
      // Only roles the user actually holds
      if (!state.user || !state.user.roles.includes(role)) return {}
      return { user: { ...state.user, activeRole: role } }
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

  updateUser: (updates) =>
    set((state) => {
      if (!state.user) return {}
      return { user: { ...state.user, ...updates } }
    }),

  hydrate: async (loadUser) => {
    const version = get().sessionVersion
    try {
      const session = parseSession(await credentialStorage.getItemAsync('session'))
      if (get().sessionVersion !== version) { set({ hydrated: true }); return }
      if (session) {
        useNotificationStore.getState().reset()
        const restored = version + 1
        // Credentials first, so the profile request (and a refresh it
        // triggers) runs in this session; still signed out until it answers.
        set({ userId: session.userId, user: null, token: session.token, refreshToken: session.refreshToken, biometricSession: session.biometricSession, sessionVersion: restored })
        const placeholder = pendingProfile(session.userId)
        const outcome = await restoreProfile({
          userId: session.userId,
          load: loadUser,
          current: () => get().sessionVersion === restored && (get().user === null || get().user === placeholder),
          apply: (user) => set({ user }),
        })
        if (outcome === 'ended' || get().sessionVersion !== restored) { set({ hydrated: true }); return }
        suppressBiometricAutoPrompt()
        set({ user: get().user ?? placeholder, isAuthenticated: true, hydrated: true })
        return
      }
    } catch { /* no-op */ }
    set({ hydrated: true })
  },
}))

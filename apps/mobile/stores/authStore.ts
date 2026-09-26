import { create } from 'zustand'
import { useNotificationStore } from './notificationStore'
import { credentialStorage as SecureStore } from '../lib/credentialStorage'

const AUTH_KEY = 'rentos_auth'

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
  hydrate: () => Promise<void>
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  sessionVersion: 0,
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
    const biometricSession = opts?.biometricSession ?? false
    set({ user, token, refreshToken: refreshToken ?? null, biometricSession, isAuthenticated: true, sessionVersion: get().sessionVersion + 1 })
    SecureStore.setItemAsync(AUTH_KEY, JSON.stringify({ user, token, refreshToken, biometricSession })).catch(() => {})
  },

  logout: () => {
    useNotificationStore.getState().reset()
    set({ user: null, token: null, refreshToken: null, biometricSession: false, isAuthenticated: false, sessionVersion: get().sessionVersion + 1 })
    SecureStore.deleteItemAsync(AUTH_KEY).catch(() => {})
  },

  switchRole: (role) =>
    set((state) => {
      // Only roles the user actually holds
      if (!state.user || !state.user.roles.includes(role)) return {}
      const updated = { ...state.user, activeRole: role }
      if (state.token) {
        SecureStore.setItemAsync(AUTH_KEY, JSON.stringify({
          user: updated,
          token: state.token,
          refreshToken: state.refreshToken,
          biometricSession: state.biometricSession,
        })).catch(() => {})
      }
      return { user: updated }
    }),

  // Token rotation MUST go through here — a bare setState() never reaches
  // SecureStore, so the next cold start restores a revoked token and the user
  // gets force-logged-out (this was the main mobile session bug).
  updateTokens: (token, refreshToken) =>
    set((state) => {
      SecureStore.setItemAsync(AUTH_KEY, JSON.stringify({
        user: state.user,
        token,
        refreshToken,
        biometricSession: state.biometricSession,
      })).catch(() => {})
      return { token, refreshToken }
    }),

  // A password change signs every other session out and returns a fresh
  // ordinary pair for this device, replacing a biometric session too (its
  // biometric tokens were revoked with the rest).
  renewSession: (token, refreshToken) =>
    set((state) => {
      SecureStore.setItemAsync(AUTH_KEY, JSON.stringify({
        user: state.user,
        token,
        refreshToken,
        biometricSession: false,
      })).catch(() => {})
      return { token, refreshToken, biometricSession: false }
    }),

  updateUser: (updates) =>
    set((state) => {
      if (!state.user) return {}
      const updated = { ...state.user, ...updates }
      if (state.token) {
        SecureStore.setItemAsync(AUTH_KEY, JSON.stringify({
          user: updated,
          token: state.token,
          refreshToken: state.refreshToken,
          biometricSession: state.biometricSession,
        })).catch(() => {})
      }
      return { user: updated }
    }),

  hydrate: async () => {
    const version = get().sessionVersion
    try {
      const raw = await SecureStore.getItemAsync(AUTH_KEY)
      if (get().sessionVersion !== version) { set({ hydrated: true }); return }
      if (raw) {
        const { user, token, refreshToken, biometricSession } = JSON.parse(raw)
        if (user && token) {
          useNotificationStore.getState().reset()
          set({ user, token, refreshToken: refreshToken ?? null, biometricSession: !!biometricSession, isAuthenticated: true, hydrated: true, sessionVersion: version + 1 })
          return
        }
      }
    } catch { /* no-op */ }
    set({ hydrated: true })
  },
}))

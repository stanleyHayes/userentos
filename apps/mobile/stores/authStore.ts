import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'

const AUTH_KEY = 'rentos_auth'

export interface User {
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
  updateUser: (updates: Partial<User>) => void
  hydrate: () => Promise<void>
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  token: null,
  refreshToken: null,
  biometricSession: false,
  isAuthenticated: false,
  hydrated: false,

  login: (user, token, refreshToken, opts) => {
    const biometricSession = opts?.biometricSession ?? false
    set({ user, token, refreshToken: refreshToken ?? null, biometricSession, isAuthenticated: true })
    SecureStore.setItemAsync(AUTH_KEY, JSON.stringify({ user, token, refreshToken, biometricSession })).catch(() => {})
  },

  logout: () => {
    set({ user: null, token: null, refreshToken: null, biometricSession: false, isAuthenticated: false })
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
    try {
      const raw = await SecureStore.getItemAsync(AUTH_KEY)
      if (raw) {
        const { user, token, refreshToken, biometricSession } = JSON.parse(raw)
        if (user && token) {
          set({ user, token, refreshToken: refreshToken ?? null, biometricSession: !!biometricSession, isAuthenticated: true, hydrated: true })
          return
        }
      }
    } catch { /* no-op */ }
    set({ hydrated: true })
  },
}))

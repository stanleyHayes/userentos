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
  isAuthenticated: boolean
  hydrated: boolean
  login: (user: User, token: string, refreshToken?: string) => void
  logout: () => void
  switchRole: (role: string) => void
  hydrate: () => Promise<void>
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  hydrated: false,

  login: (user, token, refreshToken) => {
    set({ user, token, refreshToken: refreshToken ?? null, isAuthenticated: true })
    SecureStore.setItemAsync(AUTH_KEY, JSON.stringify({ user, token, refreshToken })).catch(() => {})
  },

  logout: () => {
    set({ user: null, token: null, refreshToken: null, isAuthenticated: false })
    SecureStore.deleteItemAsync(AUTH_KEY).catch(() => {})
  },

  switchRole: (role) =>
    set((state) => {
      const updated = state.user ? { ...state.user, activeRole: role } : null
      if (updated && state.token) {
        SecureStore.setItemAsync(AUTH_KEY, JSON.stringify({
          user: updated,
          token: state.token,
          refreshToken: state.refreshToken,
        })).catch(() => {})
      }
      return { user: updated }
    }),

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(AUTH_KEY)
      if (raw) {
        const { user, token, refreshToken } = JSON.parse(raw)
        if (user && token) {
          set({ user, token, refreshToken: refreshToken ?? null, isAuthenticated: true, hydrated: true })
          return
        }
      }
    } catch { /* no-op */ }
    set({ hydrated: true })
  },
}))

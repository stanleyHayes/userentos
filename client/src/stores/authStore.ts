import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useState, useEffect } from 'react'
import type { User, UserRole } from '@/types'
import { portal } from '@/hooks/usePortal'
import { getBestRoleForPortal } from '@/lib/subdomain'

interface AuthState {
  user: User | null
  token: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean

  login: (user: User, token: string, refreshToken?: string) => void
  logout: () => void
  switchRole: (role: UserRole) => void
  setLoading: (loading: boolean) => void
  updateUser: (user: Partial<User>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      login: (user, token, refreshToken) => {
        // On portal subdomains, auto-switch to the best matching role
        if (portal !== 'www') {
          const bestRole = getBestRoleForPortal(user.roles, portal)
          if (bestRole) {
            user = { ...user, activeRole: bestRole }
          }
        }
        set({ user, token, refreshToken: refreshToken ?? null, isAuthenticated: true, isLoading: false })
      },

      logout: () => {
        set({ user: null, token: null, refreshToken: null, isAuthenticated: false })
      },

      switchRole: (role) =>
        set((state) => ({
          user: state.user ? { ...state.user, activeRole: role } : null,
        })),

      setLoading: (isLoading) => set({ isLoading }),

      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
    }),
    {
      name: 'rentos-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }) as unknown as AuthState,
    }
  )
)

/**
 * Returns true once the auth store has finished hydrating from localStorage.
 */
export function useAuthHydrated(): boolean {
  const [hydrated, setHydrated] = useState(useAuthStore.persist.hasHydrated())
  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true))
    return unsub
  }, [])
  return hydrated
}

/**
 * After localStorage hydration restores `token`, verify it with the server
 * and fetch the full user. Only redirects to login if the token is truly
 * expired or invalid. Survives page refreshes and HMR reloads.
 */
export function useAuthRehydrate(): boolean {
  const { token, isAuthenticated, user, login, logout } = useAuthStore()
  const hasHydrated = useAuthHydrated()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!hasHydrated) return

    // No token — nothing to verify
    if (!token || !isAuthenticated) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- gating async server verification
      setReady(true)
      return
    }

    // User already loaded (same session, no refresh)
    if (user) {
      setReady(true)
      return
    }

    // Verify token with server and fetch user
    let cancelled = false
    const base = import.meta.env.VITE_API_URL || '/api'
    fetch(`${base}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (cancelled) return
        if (!res.ok) {
          // Token is expired or invalid — clear and redirect
          logout()
          setReady(true)
          return
        }
        const data = await res.json()
        if (cancelled) return
        const fetchedUser = data.data as User
        // Apply portal role override
        if (portal !== 'www') {
          const bestRole = getBestRoleForPortal(fetchedUser.roles, portal)
          if (bestRole) fetchedUser.activeRole = bestRole
        }
        // Re-login with fetched user to restore full state
        useAuthStore.setState({ user: fetchedUser })
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) {
          // Network error — don't logout, keep token for retry
          // Just mark as ready so the app can render
          setReady(true)
        }
      })

    return () => { cancelled = true }
  }, [hasHydrated, token, isAuthenticated, user, login, logout])

  return ready
}

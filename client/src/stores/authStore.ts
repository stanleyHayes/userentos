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
          // Only allow switching to a role the user actually holds — a spoofed
          // activeRole otherwise reveals nav links that bounce off RequireRole.
          user: state.user && state.user.roles.includes(role) ? { ...state.user, activeRole: role } : state.user,
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
 * Silently rotate the session via the refresh token. Returns the new access
 * token on success, null otherwise. Mirrors the refresh flow in lib/api.ts —
 * duplicated here to avoid a circular import between the store and the client.
 */
async function tryRefreshSession(): Promise<string | null> {
  const { refreshToken } = useAuthStore.getState()
  if (!refreshToken) return null
  try {
    const base = import.meta.env.VITE_API_URL || '/api'
    const res = await fetch(`${base}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const { token, refreshToken: newRefreshToken } = data.data ?? {}
    if (!token) return null
    useAuthStore.setState({ token, refreshToken: newRefreshToken ?? refreshToken })
    return token as string
  } catch {
    return null
  }
}

/**
 * After localStorage hydration restores `token`, verify it with the server
 * and fetch the full user. An expired 15-minute access token is silently
 * refreshed via the 7-day refresh token — previously this force-logged-out
 * the user on every reload, defeating the whole point of refresh tokens.
 * Only redirects to login if the session is truly dead.
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
    const fetchMe = (bearer: string) =>
      fetch(`${base}/users/me`, { headers: { Authorization: `Bearer ${bearer}` } })

    ;(async () => {
      let res = await fetchMe(token)
      // Expired access token — rotate via the refresh token and retry once.
      if (res.status === 401) {
        const newToken = await tryRefreshSession()
        if (newToken) {
          res = await fetchMe(newToken)
        } else {
          // Refresh token also dead — session is over.
          if (!cancelled) {
            logout()
            setReady(true)
          }
          return
        }
      }
      if (cancelled) return
      if (!res.ok) {
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
    })().catch(() => {
      // Network error — keep the session and mark ready; React Query surfaces
      // its own error states. Never log out a possibly-valid session on a
      // flaky connection.
      if (!cancelled) setReady(true)
    })

    return () => { cancelled = true }
  }, [hasHydrated, token, isAuthenticated, user, login, logout])

  return ready
}

import { create } from 'zustand'
import toast from 'react-hot-toast'
import { persist } from 'zustand/middleware'
import { useState, useEffect } from 'react'
import type { User, UserRole } from '@/types'
import { portal } from '@/hooks/usePortal'
import { getBestRoleForPortal } from '@/lib/subdomain'
import { accessTokenExpired } from '@/lib/accessToken'
import { AUTH_KEY, PROFILE_KEY, createAuthStorage } from '@/stores/authStorage'

let sessionGeneration = 0
export const getSessionGeneration = () => sessionGeneration

interface AuthState {
  user: User | null
  token: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  sessionId: string | null

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
      sessionId: null,

      login: (user, token, refreshToken) => {
        sessionGeneration++
        toast.remove()
        // On portal subdomains, auto-switch to the best matching role
        if (portal !== 'www') {
          const bestRole = getBestRoleForPortal(user.roles, portal)
          if (bestRole) {
            user = { ...user, activeRole: bestRole }
          }
        }
        set({ user, token, refreshToken: refreshToken ?? null, isAuthenticated: true, isLoading: false, sessionId: crypto.randomUUID() })
      },

      logout: () => {
        sessionGeneration++
        toast.remove()
        set({ user: null, token: null, refreshToken: null, isAuthenticated: false, sessionId: null })
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
      name: AUTH_KEY,
      // Credentials and profile under separate keys: see authStorage.ts.
      storage: createAuthStorage<AuthState>(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        sessionId: state.sessionId,
      }) as unknown as AuthState,
    }
  )
)

// Cover hydration and direct account replacement as well as the public actions.
// Access-token rotation and ordinary profile updates keep current notifications.
const unsubscribeNotificationSession = useAuthStore.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id || state.isAuthenticated !== previous.isAuthenticated || state.sessionId !== previous.sessionId) { sessionGeneration++; toast.remove() }
})
function syncAuthStorage(event: StorageEvent) {
  if (event.storageArea !== localStorage || (event.key !== AUTH_KEY && event.key !== PROFILE_KEY && event.key !== null)) return
  // Re-read current storage rather than replaying an event that may already be stale.
  if (localStorage.getItem(AUTH_KEY) === null) useAuthStore.getState().logout()
  else void useAuthStore.persist.rehydrate()
}
window.addEventListener('storage', syncAuthStorage)
if (import.meta.hot) import.meta.hot.dispose(() => {
  unsubscribeNotificationSession()
  window.removeEventListener('storage', syncAuthStorage)
})

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
 * Request rotated credentials without mutating a possibly replaced session.
 * Null means rejected credentials; temporary failures throw.
 */
// Bound the auth-verification calls: without a timeout a hung connection would
// leave the app on the loading screen indefinitely (fetch has no default timeout).
const AUTH_CHECK_TIMEOUT_MS = 4_000

async function tryRefreshSession(refreshToken: string | null, isCurrent: () => boolean): Promise<{ token: string; refreshToken: string } | null> {
  if (!refreshToken || !isCurrent()) return null
  const base = import.meta.env.VITE_API_URL || '/api'
  const res = await fetch(`${base}/auth/refresh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }), signal: AbortSignal.timeout(AUTH_CHECK_TIMEOUT_MS),
  })
  if (!isCurrent()) return null
  if (res.status === 401 || res.status === 403) return null
  if (!res.ok) throw new Error('Session refresh is temporarily unavailable')
  const data = await res.json()
  if (!isCurrent()) return null
  const { token, refreshToken: rotated } = data.data ?? {}
  if (typeof token !== 'string' || !token || (rotated !== undefined && (typeof rotated !== 'string' || !rotated))) throw new Error('Incomplete refresh response')
  return { token, refreshToken: rotated ?? refreshToken }
}

let refreshAttempt: { generation: number; promise: Promise<boolean> } | null = null

/** One refresh for API requests and restoration within the current login session. */
export function refreshCurrentSession(rejectedToken: string | null): Promise<boolean> {
  const origin = useAuthStore.getState()
  const generation = sessionGeneration
  // Another request may already have rotated the token while this 401 travelled.
  if (origin.token && origin.token !== rejectedToken) return Promise.resolve(true)
  if (refreshAttempt?.generation === generation) return refreshAttempt.promise
  const performRefresh = async (locked: boolean) => {
    // Storage events may still be queued when this tab acquires the origin lock.
    if (localStorage.getItem(AUTH_KEY) === null) useAuthStore.getState().logout()
    else await useAuthStore.persist.rehydrate()
    const latest = useAuthStore.getState()
    if (generation !== sessionGeneration || latest.user?.id !== origin.user?.id || latest.sessionId !== origin.sessionId || latest.isAuthenticated !== origin.isAuthenticated) throw new Error('Account session changed. Please try again.')
    if (latest.token && latest.token !== rejectedToken) return true
    const sameSession = () => {
      const current = useAuthStore.getState()
      return generation === sessionGeneration && current.user?.id === latest.user?.id && current.sessionId === latest.sessionId && current.isAuthenticated === latest.isAuthenticated
    }
    const replaced = () => {
      const current = useAuthStore.getState()
      return current.token !== latest.token || current.refreshToken !== latest.refreshToken
    }
    // Nothing orders the lock grant against the previous holder's storage write,
    // so this tab may refresh with the token that holder just rotated and see
    // the holder's pair arrive mid-flight. Only lock holders rotate a session,
    // and the server answers a just-rotated token once, retiring the pair it was
    // rotated into, so under the lock the answer is the newest pair and is kept.
    // Without the lock, any change of credentials means the session moved on.
    const isCurrent = locked ? sameSession : () => sameSession() && !replaced()
    const rotated = await tryRefreshSession(latest.refreshToken, isCurrent)
    if (localStorage.getItem(AUTH_KEY) === null) useAuthStore.getState().logout()
    else await useAuthStore.persist.rehydrate()
    if (!isCurrent()) throw new Error('Account session changed. Please try again.')
    // Rejected, but the pair that arrived meanwhile is live: retry with it.
    if (!rotated) return replaced()
    useAuthStore.setState(rotated)
    return true
  }
  const promise = (async () => {
    if (navigator.locks) return await navigator.locks.request(`rentos-auth-refresh:${origin.sessionId ?? 'legacy'}`, { signal: AbortSignal.timeout(10_000) }, () => performRefresh(true))
    return performRefresh(false)
  })().finally(() => { if (refreshAttempt?.promise === promise) refreshAttempt = null })
  refreshAttempt = { generation, promise }
  return promise
}

export interface SessionPair { token: string; refreshToken: string }

/**
 * Requests to /auth/* never refresh on a 401 (on the two-factor ones a 401
 * can mean a wrong code), so a signed-in /auth/ call made with an access token
 * that has already expired — Settings left open for 15 minutes — failed with
 * the server's 401. Renew it first; a rejected refresh signs out like any
 * other request would.
 */
export async function ensureLiveAccessToken(): Promise<void> {
  const token = useAuthStore.getState().token
  if (accessTokenExpired(token) && !await refreshCurrentSession(token)) {
    useAuthStore.getState().logout()
    throw new Error('Session expired')
  }
}

/**
 * A password or two-factor change signs every other session out and returns
 * a fresh pair for this device. Run it under the refresh lock so a 401 racing
 * the change waits for the new pair instead of refreshing with the revoked
 * one (which would sign this device out too), then store the pair.
 */
export async function renewSessionWith(request: () => Promise<SessionPair | null>): Promise<void> {
  // Before taking the lock below: a refresh started under it would wait on itself.
  await ensureLiveAccessToken()
  const origin = useAuthStore.getState()
  const generation = sessionGeneration
  const run = async () => {
    const pair = await request()
    const current = useAuthStore.getState()
    if (!pair?.token || !pair.refreshToken || generation !== sessionGeneration || current.user?.id !== origin.user?.id || !current.isAuthenticated) return
    useAuthStore.setState({ token: pair.token, refreshToken: pair.refreshToken })
  }
  if (navigator.locks) await navigator.locks.request(`rentos-auth-refresh:${origin.sessionId ?? 'legacy'}`, run)
  else await run()
}

/** Storage events can lag behind another tab's login/logout or token rotation. */
function matchesStoredSession(origin: AuthState): boolean {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (raw === null) { useAuthStore.getState().logout(); return false }
    const saved = JSON.parse(raw)?.state
    const matches = saved && saved.token === origin.token && saved.refreshToken === origin.refreshToken && saved.user?.id === origin.user?.id && saved.isAuthenticated === origin.isAuthenticated && (saved.sessionId ?? null) === (origin.sessionId ?? null)
    if (!matches) void useAuthStore.persist.rehydrate()
    return Boolean(matches)
  } catch {
    // Unreadable storage is not permission to overwrite a potentially newer session.
    return false
  }
}

/** Verify a restored session without letting old responses change a newer login. */
export function useAuthRehydrate(): boolean {
  const { token, isAuthenticated, user, logout } = useAuthStore()
  const userId = user?.id
  const hasHydrated = useAuthHydrated()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!hasHydrated) return
    if (!token || !isAuthenticated) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- gate restored session verification
      setReady(true)
      return
    }
    if (userId) setReady(true)
    let cancelled = false
    const origin = useAuthStore.getState()
    const generation = sessionGeneration
    const isCurrent = () => {
      const current = useAuthStore.getState()
      return !cancelled && generation === sessionGeneration && current.token === origin.token && current.refreshToken === origin.refreshToken && current.user?.id === origin.user?.id && current.isAuthenticated === origin.isAuthenticated && matchesStoredSession(origin)
    }
    const base = import.meta.env.VITE_API_URL || '/api'
    const fetchMe = (bearer: string) => fetch(`${base}/users/me`, {
      headers: { Authorization: `Bearer ${bearer}` }, signal: AbortSignal.timeout(AUTH_CHECK_TIMEOUT_MS),
    })
    void (async () => {
      const res = await fetchMe(token)
      if (!isCurrent()) return
      if (res.status === 401) {
        const refreshed = await refreshCurrentSession(token)
        if (!isCurrent()) return
        if (!refreshed) { logout(); setReady(true); return }
        // Keep rotated credentials even if the subsequent profile request is offline.
        // The token change starts a new guarded verification effect.
        return
      }
      if (res.status === 401 || res.status === 403) { logout(); setReady(true); return }
      if (!res.ok) throw new Error('Account verification is temporarily unavailable')
      const data = await res.json()
      if (!isCurrent()) return
      const fetchedUser = data.data as User
      if (!fetchedUser || typeof fetchedUser.id !== 'string' || !Array.isArray(fetchedUser.roles) || (origin.user?.id && fetchedUser.id !== origin.user.id)) throw new Error('Account verification response does not match the session')
      if (portal !== 'www') {
        const bestRole = getBestRoleForPortal(fetchedUser.roles, portal)
        if (bestRole) fetchedUser.activeRole = bestRole
      }
      // Profile only: isCurrent() already established this session is signed in.
      useAuthStore.setState({ user: fetchedUser })
      setReady(true)
    })().catch(() => {
      // Outages and malformed responses are not proof that credentials were revoked.
      if (isCurrent()) setReady(true)
    })
    return () => { cancelled = true }
  }, [hasHydrated, token, isAuthenticated, userId, logout])
  return ready
}

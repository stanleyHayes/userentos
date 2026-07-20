import { useState, useEffect } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { Toaster } from '@/components/ui/Toaster'
import { useAuthStore, useAuthRehydrate } from '@/stores/authStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { usePortal } from '@/hooks/usePortal'
import { getBestRoleForPortal } from '@/lib/subdomain'
import { api } from '@/lib/api'
import { ShieldAlert } from 'lucide-react'
import { OnboardingTour } from '@/components/onboarding/OnboardingTour'
import { SplashScreen } from '@/components/ui/SplashScreen'

// SplashScreen expects an onFinished callback; here it unmounts as soon as auth
// rehydration flips `ready`, so the timer never fires user-visibly.
const noop = () => {}

export function DashboardLayout() {
  usePushNotifications()
  const { user, isAuthenticated, switchRole, logout } = useAuthStore()
  const authReady = useAuthRehydrate()
  const { collapsed } = useSidebarStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const loadFavorites = useFavoritesStore((s) => s.load)
  const { isPortal, portal, label } = usePortal()

  // Onboarding tour: trigger on first visit per role.
  const completedTours = useOnboardingStore((s) => s.completedTours)
  const startTour = useOnboardingStore((s) => s.startTour)

  useEffect(() => {
    if (isAuthenticated) loadFavorites()
  }, [isAuthenticated, loadFavorites])

  // Once auth has hydrated and we know the user's active role, start the tour
  // for that role if it hasn't been completed yet. Runs once per role per
  // browser (persisted to localStorage by the onboarding store).
  useEffect(() => {
    if (!authReady) return
    if (!isAuthenticated) return
    const role = user?.activeRole
    if (!role) return
    if (completedTours[role]) return
    startTour(role)
    // Intentionally exclude `completedTours` from deps — startTour is a no-op
    // when the tour is already running, and we only want to react to the role
    // becoming known (e.g. after rehydration or a role switch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, isAuthenticated, user?.activeRole, startTour])

  // On portal subdomains, auto-switch to the best matching role if current role doesn't fit
  useEffect(() => {
    if (!isPortal || !user) return
    const bestRole = getBestRoleForPortal(user.roles, portal)
    if (bestRole && bestRole !== user.activeRole) {
      switchRole(bestRole)
    }
  }, [isPortal, portal, user, switchRole])

  // Wait for auth to rehydrate before deciding to redirect. A persisted session
  // with no `user` triggers a server round-trip (/users/me, possibly a token
  // refresh first) — show the branded splash instead of a blank page, which
  // read as a crash on slow networks.
  if (!authReady) {
    return <SplashScreen onFinished={noop} />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // If on a portal subdomain and user has no matching role, show access denied
  if (isPortal && user) {
    const bestRole = getBestRoleForPortal(user.roles, portal)
    if (!bestRole) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface dark:bg-[#0c0e1a] p-4">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-danger/10 dark:bg-danger/20 flex items-center justify-center">
              <ShieldAlert size={32} className="text-danger" />
            </div>
            <h1 className="text-xl font-bold text-primary-dark dark:text-white">Access Denied</h1>
            <p className="text-sm text-muted dark:text-gray-400">
              Your account does not have the required role to access the <strong>{label}</strong> portal.
              Please contact your administrator or visit the main site.
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={async () => {
                  const refreshToken = useAuthStore.getState().refreshToken
                  if (refreshToken) {
                    try { await api.post('/auth/logout', { refreshToken }) } catch { /* best effort */ }
                  }
                  logout()
                }}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-border dark:border-[#252a3a] text-muted dark:text-gray-400 hover:bg-surface dark:hover:bg-[#161927] transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )
    }
  }

  return (
    <div className="app-shell-bg min-h-screen">
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className={`transition-all duration-300 ease-in-out ${collapsed ? 'lg:ml-[72px]' : 'lg:ml-64'}`}>
        <Header onMenuToggle={() => setMobileOpen(true)} />
        <main className="p-3 sm:p-4 md:p-6">
          <div className="max-w-[1480px] mx-auto pb-10">
            <div key={location.pathname} className="page-enter">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
      <Toaster />
      <OnboardingTour />
    </div>
  )
}

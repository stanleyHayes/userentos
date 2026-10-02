import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { isPathPausedFor } from '../../../../../packages/shared/productScope'

/**
 * Route guard: renders the nested routes only if the signed-in user has one of
 * the allowed roles (super_admin always passes). This is defense-in-depth on top
 * of the server's authorization — it stops a logged-in user from URL-navigating
 * into admin/government/financier/employer pages and firing their requests.
 *
 * Must be used inside <DashboardLayout> (which already enforces authentication).
 */
export function RequireRole({ roles, children }: { roles: string[]; children?: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const userRoles = user?.roles ?? []
  const allowed = userRoles.includes('super_admin') || userRoles.some((r) => roles.includes(r))
  if (!allowed) return <Navigate to="/dashboard" replace />
  return children ? <>{children}</> : <Outlet />
}

/**
 * Screens paused for this phase (Workers, Local Services, My Bookings) are out
 * of the tenant and agent journeys: hidden from the menus, and not reachable
 * by a bookmarked or typed URL either.
 */
export function NotPaused({ children }: { children: React.ReactNode }) {
  const role = useAuthStore((s) => s.user?.activeRole)
  const { pathname } = useLocation()
  if (isPathPausedFor(pathname, role)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

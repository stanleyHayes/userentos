import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

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

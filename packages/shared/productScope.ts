// Phase 1 of the RentOS product brief (30 September 2026) runs two journeys end
// to end: tenants, and agents / agencies / property managers (the
// property_manager role). Other account types stay in the architecture, and
// existing accounts keep working, but sign-up does not offer them and their
// screens are out of the active experience until those journeys are finished.
//
// The API is the authority on which account types are open
// (apps/api/src/config/signupRoles.ts, published at GET /api/platform/features);
// DEFAULT_SIGNUP_ROLES is what clients show before that answer arrives.

export const DEFAULT_SIGNUP_ROLES = ['tenant', 'property_manager'] as const

/**
 * Accounts that list property and run a property website: landlords & owners,
 * agents / agencies / property managers, and staff. A tenant, worker or
 * business account cannot (the API refuses with 403). Mirrors
 * PROPERTY_PROFESSIONAL_ROLES in apps/api/src/services/listings.ts.
 */
export const PROPERTY_PROFESSIONAL_ROLES = ['landlord', 'property_manager', 'admin', 'super_admin'] as const

export function isPropertyProfessional(roles: readonly string[] | undefined | null): boolean {
  return !!roles?.some((role) => (PROPERTY_PROFESSIONAL_ROLES as readonly string[]).includes(role))
}

/** What kind of professional a property_manager account is. */
export const PROFESSIONAL_TYPES = [
  { value: 'agent', label: 'Agent', description: 'I find tenants and buyers for property owners' },
  { value: 'agency', label: 'Agency', description: 'A company with a team of agents' },
  { value: 'property_manager', label: 'Property manager', description: 'I look after properties for their owners' },
] as const
export type ProfessionalType = (typeof PROFESSIONAL_TYPES)[number]['value']

export function professionalTypeLabel(value: string | undefined | null): string {
  return PROFESSIONAL_TYPES.find((type) => type.value === value)?.label ?? 'Agent'
}

/** Shown on the account-type step as coming later (unless reopened); never selectable. */
export const COMING_SOON_ACCOUNT_TYPES = [
  { role: 'landlord', label: 'Landlords & owners' },
  { role: 'developer', label: 'Property developers' },
  { role: 'service_provider', label: 'Service providers' },
  { role: 'business', label: 'Local businesses' },
] as const

/** signupRoles from GET /platform/features, or null when absent or malformed. */
export function parseSignupRoles(data: unknown): string[] | null {
  const roles = (data as { signupRoles?: unknown } | null)?.signupRoles
  if (!Array.isArray(roles) || !roles.every((role) => typeof role === 'string')) return null
  return roles
}

// Workers, Local Services and My Bookings are paused for this phase: not shown
// and not reachable for the roles in the active journeys. Service providers
// and staff keep them, since those screens are the whole of a provider's job.
const PAUSED_PATH_PREFIXES = ['/workers', '/local-services', '/bookings', '/become-worker'] as const
const PAUSED_FOR_ROLES: readonly string[] = ['tenant', 'property_manager', 'landlord']

export function isPathPausedFor(path: string, role: string | undefined | null): boolean {
  if (!role || !PAUSED_FOR_ROLES.includes(role)) return false
  return PAUSED_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

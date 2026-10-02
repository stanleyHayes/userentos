import { isRoleOffered } from './regulatedFeatures.js'

/**
 * Account types open to self-service sign-up.
 *
 * Phase 1 of the product brief (30 September 2026) runs two journeys end to
 * end: tenants, and agents / agencies / property managers (property_manager).
 * Landlords, developers, service providers and local businesses stay in the
 * architecture — existing accounts keep working and an admin can still invite
 * them — but cannot be self-created until their journeys are finished.
 * SIGNUP_ROLES reopens one without a code change, e.g. "tenant,property_manager,landlord".
 *
 * Mirrors packages/shared/productScope.ts DEFAULT_SIGNUP_ROLES.
 */
export const SELF_REGISTERED_ROLES = ['tenant', 'landlord', 'property_manager', 'financier', 'employer', 'service_provider', 'business', 'developer'] as const
const DEFAULT_SIGNUP_ROLES = ['tenant', 'property_manager']

export function resolveSignupRoles(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.SIGNUP_ROLES
  if (raw === undefined || !raw.trim()) return DEFAULT_SIGNUP_ROLES
  const requested = [...new Set(raw.split(',').map((value) => value.trim()).filter(Boolean))]
  const unknown = requested.filter((role) => !(SELF_REGISTERED_ROLES as readonly string[]).includes(role))
  if (unknown.length) throw new Error(`Unknown SIGNUP_ROLES entries: ${unknown.join(', ')}`)
  return requested
}

let open = resolveSignupRoles()

/** Open for sign-up, and not an account type whose regulated service is switched off. */
export function isSignupOpen(role: string): boolean {
  return open.includes(role) && isRoleOffered(role)
}

/** What GET /platform/features publishes, so clients render the same list the API accepts. */
export function signupRoles(): string[] {
  return open.filter(isRoleOffered)
}

/** Tests only: re-read the configuration from a supplied environment. */
export function reloadSignupRoles(env: NodeJS.ProcessEnv = process.env) {
  open = resolveSignupRoles(env)
}

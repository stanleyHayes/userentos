import type { UserRole } from '@/types'

/**
 * Portal definitions — maps subdomains to role contexts.
 * Each portal knows which roles it serves and which role to default to.
 */
export type Portal = 'www' | 'tenant' | 'landlord' | 'government' | 'legal' | 'financier' | 'employer'

interface PortalConfig {
  /** Roles that can access this portal */
  roles: UserRole[]
  /** Default role to set when user logs in on this portal */
  defaultRole: UserRole
  /** Label shown in UI */
  label: string
}

export const PORTAL_CONFIG: Record<Portal, PortalConfig> = {
  www: {
    roles: ['tenant', 'landlord', 'property_manager', 'government', 'legal_officer', 'admin', 'financier', 'employer'],
    defaultRole: 'tenant',
    label: 'RentOS',
  },
  tenant: {
    roles: ['tenant'],
    defaultRole: 'tenant',
    label: 'RentOS Tenant',
  },
  landlord: {
    roles: ['landlord', 'property_manager'],
    defaultRole: 'landlord',
    label: 'RentOS Landlord',
  },
  government: {
    roles: ['government', 'admin'],
    defaultRole: 'government',
    label: 'RentOS Government',
  },
  legal: {
    roles: ['legal_officer'],
    defaultRole: 'legal_officer',
    label: 'RentOS Legal',
  },
  financier: {
    roles: ['financier'],
    defaultRole: 'financier',
    label: 'RentOS Financier',
  },
  employer: {
    roles: ['employer'],
    defaultRole: 'employer',
    label: 'RentOS Employer',
  },
}

/** Known portal subdomains */
const PORTAL_SUBDOMAINS = new Set<string>(['tenant', 'landlord', 'government', 'legal', 'financier', 'employer'])

/**
 * Detect the active portal from the current hostname.
 *
 * Examples:
 *   tenant.rentos.com.gh  → 'tenant'
 *   landlord.rentos.com.gh → 'landlord'
 *   www.rentos.com.gh     → 'www'
 *   rentos.com.gh         → 'www'
 *   localhost              → 'www'
 *   tenant.localhost       → 'tenant'  (for dev)
 */
export function detectPortal(hostname: string = window.location.hostname): Portal {
  // Extract the first subdomain segment
  const parts = hostname.split('.')
  const sub = parts[0]

  if (PORTAL_SUBDOMAINS.has(sub)) {
    return sub as Portal
  }

  return 'www'
}

/** Get config for the current portal */
export function getPortalConfig(portal: Portal): PortalConfig {
  return PORTAL_CONFIG[portal]
}

/** Check if a user role is allowed on the given portal */
export function isRoleAllowedOnPortal(role: UserRole, portal: Portal): boolean {
  if (portal === 'www') return true
  return PORTAL_CONFIG[portal].roles.includes(role)
}

/** Get the best matching role for a user on this portal */
export function getBestRoleForPortal(userRoles: UserRole[], portal: Portal): UserRole | null {
  if (portal === 'www') return userRoles[0] ?? null
  const portalRoles = PORTAL_CONFIG[portal].roles
  return userRoles.find((r) => portalRoles.includes(r)) ?? null
}

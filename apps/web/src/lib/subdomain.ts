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
    roles: ['tenant', 'landlord', 'property_manager', 'government', 'legal_officer', 'admin', 'financier', 'employer', 'service_provider', 'business'],
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
 *   tenant.userentos.com  → 'tenant'
 *   landlord.userentos.com → 'landlord'
 *   www.userentos.com     → 'www'
 *   userentos.com         → 'www'
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


/** Hostnames that are the platform itself and can never be a storefront. */
const PLATFORM_HOSTS = new Set(['userentos.com', 'www.userentos.com', 'rentos.gh', 'www.rentos.gh'])

/**
 * The storefront slug implied by the current hostname, if any (spec §4.1).
 *
 * A seller's storefront lives at {slug}.userentos.com, but detectPortal()
 * only knows the six staff portals and answers 'www' for everything else — so
 * a storefront subdomain rendered the marketing landing page while the
 * settings screen advertised that exact URL as live.
 *
 * Returns null for platform hosts, known portals and bare localhost. A custom
 * domain returns `null` too: the client cannot know which slug an arbitrary
 * domain maps to, so the app asks the server (GET /storefronts/resolve/host),
 * which is the only place that mapping exists.
 */
export function detectStorefrontSlug(hostname: string = window.location.hostname): string | null {
  const host = hostname.toLowerCase().split(':')[0]

  if (PLATFORM_HOSTS.has(host)) return null
  if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.')) return null

  const parts = host.split('.')
  const sub = parts[0]
  if (PORTAL_SUBDOMAINS.has(sub)) return null

  // {slug}.userentos.com — the platform subdomain form.
  if (host.endsWith('.userentos.com')) return sub || null

  // {slug}.localhost, so subdomain routing is testable in development.
  if (host.endsWith('.localhost')) return sub || null

  // Anything else may be an attached custom domain; only the server knows.
  return null
}

/** True when the hostname is neither the platform nor a known staff portal. */
export function isPossibleCustomDomain(hostname: string = window.location.hostname): boolean {
  const host = hostname.toLowerCase().split(':')[0]
  if (PLATFORM_HOSTS.has(host)) return false
  if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.')) return false
  if (host.endsWith('.userentos.com') || host.endsWith('.localhost')) return false
  if (PORTAL_SUBDOMAINS.has(host.split('.')[0])) return false
  return host.includes('.')
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

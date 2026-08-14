import { createContext, useContext } from 'react'
import type { Portal } from '@/lib/subdomain'
import { detectPortal, getPortalConfig, PORTAL_CONFIG } from '@/lib/subdomain'
import type { UserRole } from '@/types'

interface PortalContextValue {
  /** Which portal we're on (www, tenant, landlord, government, legal) */
  portal: Portal
  /** Whether this is a role-specific portal (not www) */
  isPortal: boolean
  /** Roles allowed on this portal */
  allowedRoles: UserRole[]
  /** Display label for this portal */
  label: string
}

// Detect once at module load — hostname doesn't change during session
const portal = detectPortal()
const config = getPortalConfig(portal)

const portalValue: PortalContextValue = {
  portal,
  isPortal: portal !== 'www',
  allowedRoles: config.roles,
  label: config.label,
}

export const PortalContext = createContext<PortalContextValue>(portalValue)

/** Access the current portal context */
export function usePortal(): PortalContextValue {
  return useContext(PortalContext)
}

/** Static portal value — use when you need it outside React (e.g., in stores) */
export { portalValue, portal, PORTAL_CONFIG }

import type { UserRole } from '@/types'

/** Display names for roles, used wherever a role is shown to a person. */
export const ROLE_LABELS: Record<UserRole, string> = {
  tenant: 'Tenant',
  landlord: 'Landlord',
  property_manager: 'Property Manager',
  government: 'Government Official',
  legal_officer: 'Legal Officer',
  admin: 'Admin',
  super_admin: 'Super Admin',
  financier: 'Financier',
  employer: 'Employer',
  service_provider: 'Service Provider',
  business: 'Local Business',
  developer: 'Property Developer',
}

export function roleLabel(role: UserRole | string): string {
  return ROLE_LABELS[role as UserRole] ?? String(role).replace(/_/g, ' ')
}

/** "Government Official and Legal Officer" — mirrors describeRoles() on the server. */
export function describeRoles(roles: (UserRole | string)[]): string {
  const labels = roles.map(roleLabel)
  if (labels.length <= 1) return labels[0] ?? 'RentOS user'
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

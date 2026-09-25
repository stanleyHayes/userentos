import type { Permission, UserRole } from '../types/index.js'

/*
 * Runtime lists of every role and permission, for zod enums and Mongoose enum
 * validators. The shared types only exist at compile time, so request bodies
 * were trusted to contain strings — and Mongoose casts `{ _id: 'super_admin' }`
 * to 'super_admin', which walked straight past `roles.includes(...)` checks.
 *
 * Declared as Record<Union, true> so adding a role or permission to the shared
 * union without listing it here is a compile error, not a silent 400.
 */
const ROLE_SET: Record<UserRole, true> = {
  tenant: true,
  landlord: true,
  property_manager: true,
  government: true,
  legal_officer: true,
  admin: true,
  super_admin: true,
  financier: true,
  employer: true,
  service_provider: true,
  business: true,
  developer: true,
}

const PERMISSION_SET: Record<Permission, true> = {
  'users:view': true,
  'users:create': true,
  'users:edit': true,
  'users:delete': true,
  'users:invite': true,
  'users:manage_permissions': true,
  'properties:view': true,
  'properties:create': true,
  'properties:edit': true,
  'properties:delete': true,
  'properties:review': true,
  'agreements:view': true,
  'agreements:create': true,
  'agreements:edit': true,
  'agreements:terminate': true,
  'payments:view': true,
  'payments:process': true,
  'payments:refund': true,
  'disputes:view': true,
  'disputes:manage': true,
  'disputes:assign': true,
  'analytics:view': true,
  'analytics:export': true,
  'blog:view': true,
  'blog:create': true,
  'blog:edit': true,
  'blog:delete': true,
  'legal:view': true,
  'legal:create': true,
  'legal:edit': true,
  'simulation:run': true,
  'subscriptions:view': true,
  'subscriptions:manage': true,
  'financing:view': true,
  'financing:offer': true,
  'financing:approve': true,
  'financing:disburse': true,
  'financing:collect': true,
  'financing:default_manage': true,
  'employer:view_employees': true,
  'employer:invite_employees': true,
  'employer:configure_deductions': true,
  'employer:approve_deductions': true,
  'employer:run_payroll': true,
  'employer:disburse': true,
  'employer:view_payroll_reports': true,
  'insurance:review_claims': true,
  'system:settings': true,
  'system:audit_logs': true,
}

export const USER_ROLES = Object.keys(ROLE_SET) as [UserRole, ...UserRole[]]
export const PERMISSIONS = Object.keys(PERMISSION_SET) as [Permission, ...Permission[]]

/** Roles only a super admin may hand out, whatever else the caller holds. */
export const SUPER_ADMIN_ONLY_ROLES: readonly UserRole[] = ['super_admin', 'admin']

/*
 * Act 843 minimisation: only administrators handle account support, so only
 * they see other people's contact details. Regulators (government) and legal
 * officers work from names, statuses and aggregates — never another person's
 * email, phone or national ID number.
 */
export const ADMIN_ROLES: readonly UserRole[] = ['admin', 'super_admin']

export function isAdminStaff(roles: readonly string[] | undefined): boolean {
  return !!roles?.some((r) => (ADMIN_ROLES as readonly string[]).includes(r))
}

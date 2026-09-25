import { Agreement } from '../models/Agreement.js'

/**
 * A landlord can create a draft naming any user as tenant, so a draft (or a
 * pending_signatures lease the tenant never signed) proves nothing about the
 * tenant. Only leases the tenant signed that went live — current or ended —
 * establish the relationship that unlocks their contact details, credit
 * report, dispute filing and score penalties.
 */
export const SIGNED_TENANCY_STATUSES = ['active', 'expired', 'terminated', 'disputed'] as const

export function signedTenancyFilter(extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    status: { $in: [...SIGNED_TENANCY_STATUSES] },
    tenantSignature: { $nin: [null, ''] },
  }
}

export function isSignedTenancy(agreement: { status?: string | null; tenantSignature?: string | null }): boolean {
  return !!agreement.tenantSignature && (SIGNED_TENANCY_STATUSES as readonly string[]).includes(agreement.status ?? '')
}

export async function hasSignedTenancy(landlordId: string, tenantId: string, propertyId?: string): Promise<boolean> {
  const filter = signedTenancyFilter({ landlordId, tenantId, ...(propertyId ? { propertyId } : {}) })
  return !!(await Agreement.exists(filter))
}

/** Contact details are the tenant's to disclose — they do so by signing. */
export function tenantHasSigned(agreement: { tenantSignature?: string | null }): boolean {
  return !!agreement.tenantSignature
}

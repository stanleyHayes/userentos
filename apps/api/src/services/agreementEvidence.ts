import { createHash } from 'node:crypto'

/**
 * Electronic signature evidence (Electronic Transactions Act, 2008, Act 772):
 * who signed, when, from where, which exact terms (SHA-256 of a canonical
 * serialisation + version) and the consent statement they accepted.
 */
export const SIGNATURE_CONSENT_VERSION = 1
export const SIGNATURE_CONSENT_STATEMENT = 'I have read this rental agreement. Typing my full legal name and submitting it is my electronic signature, and I intend it to bind me as if I had signed by hand (Electronic Transactions Act, 2008 (Act 772)).'

export interface AgreementTerms {
  _id: unknown
  version?: number | null
  propertyId: string
  landlordId: string
  tenantId: string
  startDate: string
  endDate: string
  rentAmount: number
  securityDeposit?: number | null
  advanceMonths?: number | null
  terms?: string[] | null
  specialConditions?: string[] | null
}

/** Fixed key order and normalised values, so the same terms always hash the same. */
export function canonicalAgreementTerms(agreement: AgreementTerms): string {
  return JSON.stringify({
    schema: 1,
    agreementId: String(agreement._id),
    version: agreement.version ?? 1,
    propertyId: agreement.propertyId,
    landlordId: agreement.landlordId,
    tenantId: agreement.tenantId,
    startDate: agreement.startDate,
    endDate: agreement.endDate,
    rentAmount: Number(agreement.rentAmount),
    securityDeposit: Number(agreement.securityDeposit ?? 0),
    advanceMonths: Number(agreement.advanceMonths ?? 0),
    terms: [...(agreement.terms ?? [])].map(String),
    specialConditions: [...(agreement.specialConditions ?? [])].map(String),
  })
}

export function agreementTermsHash(agreement: AgreementTerms): string {
  return createHash('sha256').update(canonicalAgreementTerms(agreement)).digest('hex')
}

interface EvidenceEntry { userId?: string; ipAddress?: string; userAgent?: string }

/**
 * Parties see each other's signature (name, time, terms hash) but not the
 * counterparty's IP address or device — that stays with the platform for
 * disputes and is returned only to staff or to the signer themselves.
 */
export function evidenceForViewer<T extends EvidenceEntry>(entries: T[] | undefined, viewerId: string, isStaff: boolean): T[] {
  return (entries ?? []).map((entry) => {
    if (isStaff || entry.userId === viewerId) return entry
    const { ipAddress: _ip, userAgent: _ua, ...rest } = entry
    return rest as T
  })
}

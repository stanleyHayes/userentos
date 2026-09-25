import { LEGAL_ENTITY, legalEntityName } from '../../../../../packages/shared/legalVersions'

export { LEGAL_ENTITY, legalEntityName }
export { PRIVACY_VERSION, TERMS_VERSION } from '../../../../../packages/shared/legalVersions'

/** "25 September 2026 · version 2026-09-25" — what the notices print as "Last updated". */
export function versionLabel(version: string): string {
  const date = new Date(`${version}T00:00:00Z`)
  const human = Number.isNaN(date.getTime())
    ? version
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  return `${human} · version ${version}`
}

/** Where the Data Protection Commission takes complaints. */
export const DPC = {
  name: 'Data Protection Commission, Ghana',
  website: 'https://dpc.gov.gh',
  websiteLabel: 'dpc.gov.gh',
} as const

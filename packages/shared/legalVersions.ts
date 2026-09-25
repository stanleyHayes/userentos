/**
 * Legal document versions, the data-controller identity, and the consent
 * statement every sign-up surface shows.
 *
 * The version constants and LEGAL_ENTITY are defined in ./types/index.ts — the
 * API compiles only its synced copy of that file (rootDir: src), so that is
 * the one place both the server check and the clients can read. Import from
 * here in the web and mobile apps.
 *
 * OPERATOR CHECKLIST before launch (also in apps/api/DEPLOYMENT.md):
 *  - set LEGAL_ENTITY.registeredName (and registrationNumber /
 *    dpcRegistrationNumber once issued) in packages/shared/types/index.ts;
 *  - when the Terms or Privacy Policy text changes, bump TERMS_VERSION /
 *    PRIVACY_VERSION to the date of the change so users are asked again.
 */
import { LEGAL_ENTITY, TERMS_VERSION, PRIVACY_VERSION } from './types/index'

export {
  TERMS_VERSION,
  PRIVACY_VERSION,
  LEGAL_ENTITY,
  isConsentRequired,
} from './types/index'
export type { UserConsents, LegalEntity } from './types/index'

/** Public pages the apps link to (mobile opens them in the browser). */
export const LEGAL_URLS = {
  terms: `${LEGAL_ENTITY.website}/terms`,
  privacy: `${LEGAL_ENTITY.website}/privacy`,
  dataProtection: `${LEGAL_ENTITY.website}/data-protection`,
  notificationSettings: `${LEGAL_ENTITY.website}/settings?tab=notifications`,
} as const

/** Checkbox wording. Keep identical on web and mobile. */
export const CONSENT_STATEMENT = 'I am 18 or older and agree to the Terms of Service and Privacy Policy'

/** Body for POST /auth/register, POST /invitations/accept and POST /auth/consents. */
export function buildAcceptance(): { termsVersion: string; privacyVersion: string; ageConfirmed: true } {
  return { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, ageConfirmed: true }
}

/** The controller name as notices should print it. */
export function legalEntityName(): string {
  return LEGAL_ENTITY.registeredName
    ? `${LEGAL_ENTITY.registeredName} (trading as ${LEGAL_ENTITY.tradingName})`
    : LEGAL_ENTITY.tradingName
}

import type { Request } from 'express'
import { z } from 'zod'
import { TERMS_VERSION, PRIVACY_VERSION, PREVIOUS_PRIVACY_VERSION } from '../types/index.js'
import type { IUserConsents } from '../models/User.js'

const STALE_VERSION = 'The Terms of Service or Privacy Policy has been updated. Please reload and review the current version before continuing.'

/**
 * What a client must send to create an account or record renewed consent:
 * the exact versions it displayed, plus confirmation the user is 18 or over
 * (the Terms require it). Anything else — a missing object, an old version,
 * ageConfirmed other than literal true — is refused.
 */
export const acceptanceSchema = z.object({
  termsVersion: z.literal(TERMS_VERSION, { error: STALE_VERSION }),
  privacyVersion: z.literal(PRIVACY_VERSION, { error: STALE_VERSION }),
  ageConfirmed: z.literal(true, { error: 'You must confirm you are 18 or older' }),
}, { error: 'You must accept the Terms of Service and Privacy Policy' })

export type Acceptance = z.infer<typeof acceptanceSchema>

/**
 * Account creation (registration, invitation acceptance): the same, except
 * the previous Privacy Policy version is also accepted. App builds already in
 * people's hands send the version they were built with, and there are no
 * over-the-air updates, so after a bump every sign-up from them was refused.
 * The version actually accepted is what gets stored, so isConsentRequired()
 * is true and the new account is asked to accept the current version.
 */
export const signupAcceptanceSchema = acceptanceSchema.extend({
  privacyVersion: z.union([z.literal(PRIVACY_VERSION), z.literal(PREVIOUS_PRIVACY_VERSION)], { error: STALE_VERSION }),
})

const MAX_USER_AGENT = 512

/** The record stored on the user — evidence of who accepted what, when, from where. */
export function buildConsentRecord(acceptance: Acceptance | z.infer<typeof signupAcceptanceSchema>, req: Request, now = new Date()): IUserConsents {
  const ua = req.headers['user-agent']
  return {
    termsVersion: acceptance.termsVersion,
    privacyVersion: acceptance.privacyVersion,
    ageConfirmed: acceptance.ageConfirmed,
    acceptedAt: now,
    ip: req.ip || undefined,
    userAgent: typeof ua === 'string' ? ua.slice(0, MAX_USER_AGENT) : undefined,
  }
}

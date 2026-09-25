import type { Types } from 'mongoose'
import { decryptPii, piiLast4, PII_FIELDS } from '../utils/piiCrypto.js'

/** The tenant's own view: everything, with the ID number decrypted. */
export function ownProfileView<T extends { _id: unknown; idNumber?: string }>(profile: T) {
  return { ...profile, idNumber: decryptPii(profile.idNumber, PII_FIELDS.tenantIdNumber), id: (profile._id as Types.ObjectId).toString() }
}

/*
 * What a landlord/official with approved access may see (Act 843 data
 * minimisation). An allowlist, so new profile fields stay private by default.
 * Never: the ID number (last 4 only), ID/selfie/income/address document URLs,
 * family details (marital status, spouse, children, dependents), religion,
 * ethnicity, or diet (which can reveal religion or health).
 */
export const SHARED_PROFILE_FIELDS = [
  'userId', 'dateOfBirth', 'gender', 'nationality', 'hometown', 'languagesSpoken', 'bio',
  'highestEducation', 'institution', 'fieldOfStudy', 'graduationYear', 'currentlyStudying',
  'employmentStatus', 'occupation', 'employer', 'employerAddress', 'monthlyIncome', 'primaryCurrency', 'incomeSources', 'employmentDuration', 'workPhone', 'linkedinUrl', 'professionalLicense',
  'numberOfOccupants', 'smoker', 'drinker', 'pets', 'petType', 'petCount', 'noiseLevel', 'workSchedule', 'hobbies', 'clubs', 'vehicleOwner', 'vehicleType',
  'personalReferences', 'professionalReferences', 'previousRentals', 'hasBeenEvicted', 'evictionDetails', 'emergencyContact',
  'idType', 'idVerified', 'incomeVerified', 'addressVerified', 'completionScore', 'profileComplete', 'lastUpdated', 'createdAt', 'updatedAt',
] as const

export function sharedProfileView(profile: Record<string, unknown> & { _id: unknown }) {
  const shared: Record<string, unknown> = { id: (profile._id as Types.ObjectId).toString() }
  for (const field of SHARED_PROFILE_FIELDS) if (profile[field] !== undefined) shared[field] = profile[field]
  shared.idNumberLast4 = piiLast4(profile.idNumber, PII_FIELDS.tenantIdNumber)
  return shared
}

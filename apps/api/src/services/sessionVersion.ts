/** Missing claims/fields represent accounts that have never revoked sessions.
 * Once incremented, an older token must fail even within the same JWT second. */
export function sessionVersionFilter(version: unknown) {
  const value = version === undefined ? 0 : version
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Invalid session version')
  }
  return value === 0
    ? { $or: [{ sessionVersion: 0 }, { sessionVersion: { $exists: false } }] }
    : { sessionVersion: value }
}

/** Only biometric-issued access tokens carry this claim. */
export function biometricVersionFilter(version: unknown) {
  if (version === undefined) return {}
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) {
    throw new Error('Invalid biometric version')
  }
  return version === 0
    ? { $and: [{ $or: [{ biometricVersion: 0 }, { biometricVersion: { $exists: false } }] }] }
    : { biometricVersion: version }
}

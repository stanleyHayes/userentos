/**
 * What the keychain keeps for a signed-in session: the account id and its
 * credentials, nothing else. The profile (national ID, consents, subscription
 * snapshot) is fetched from /users/me after every cold start instead, which
 * keeps the item well under SecureStore's 2 KB guidance and keeps personal
 * data out of device storage and backups.
 */
export interface StoredSession {
  userId: string
  token: string
  refreshToken: string | null
  /** The refresh token is a biometric one: renew through /auth/biometric/exchange. */
  biometricSession: boolean
}

export function serializeSession(session: StoredSession): string {
  return JSON.stringify({ userId: session.userId, token: session.token, refreshToken: session.refreshToken, biometricSession: session.biometricSession })
}

/** Reads the current record and the legacy one, which held the whole profile under `user`. */
export function parseSession(raw: string | null): StoredSession | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw)
    const userId = typeof value?.userId === 'string' ? value.userId : typeof value?.user?.id === 'string' ? value.user.id : ''
    if (!userId || typeof value.token !== 'string' || !value.token) return null
    return {
      userId,
      token: value.token,
      refreshToken: typeof value.refreshToken === 'string' && value.refreshToken ? value.refreshToken : null,
      biometricSession: !!value.biometricSession,
    }
  } catch {
    return null
  }
}

/** The legacy blob rewritten as the minimal record; null when it holds no usable session. */
export function minimalSessionRecord(legacy: string): string | null {
  const session = parseSession(legacy)
  return session ? serializeSession(session) : null
}

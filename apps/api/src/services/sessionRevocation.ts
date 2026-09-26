import { User } from '../models/User.js'
import { RefreshToken } from '../models/RefreshToken.js'
import { BiometricToken } from '../models/BiometricToken.js'
import { DeviceToken } from '../models/DeviceToken.js'
import { recordRevokedSession } from '../models/RevokedSession.js'
import { disconnectUser, disconnectSession } from './socket.js'

/**
 * A refresh or biometric token rotated less than this long ago and presented
 * again is refused without revoking anything: most likely the client retried
 * after losing the response that carried its successor, not a stolen copy.
 */
export const ROTATION_GRACE_MS = 30_000

/**
 * Access tokens carry roles/permissions as claims, so an admin changing them
 * has no effect until every outstanding token dies. Bumping sessionVersion
 * makes authenticate() reject them immediately; refresh/biometric
 * credentials and push enrolments go with them, mirroring
 * AuthService.revokeAllSessions (which is private to the auth service).
 */
export async function revokeAccountSessions(userId: string, reason: string): Promise<void> {
  const now = new Date()
  await User.updateOne({ _id: userId }, { $inc: { sessionVersion: 1 } })
  disconnectUser(userId)
  await Promise.all([
    DeviceToken.deleteMany({ userId }),
    RefreshToken.updateMany({ userId, revokedAt: { $exists: false } }, { $set: { revokedAt: now, revokedReason: reason } }),
    BiometricToken.updateMany({ userId, revokedAt: { $exists: false } }, { $set: { revokedAt: now, revokedReason: reason } }),
  ])
}

/**
 * Sign one device out: its access tokens (which carry the session family as
 * `sid`) stop working and its sockets close, while the account's other
 * devices stay signed in. The caller revokes the family's refresh or
 * biometric credentials. The RevokedSession row is written first, so a
 * rotation racing this call either sees it or is caught by that revocation.
 */
export async function revokeDeviceSession(sid: string, reason: string): Promise<void> {
  await recordRevokedSession(sid, reason)
  disconnectSession(sid)
}

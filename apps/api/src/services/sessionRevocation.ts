import { User } from '../models/User.js'
import { RefreshToken } from '../models/RefreshToken.js'
import { BiometricToken } from '../models/BiometricToken.js'
import { DeviceToken } from '../models/DeviceToken.js'
import { disconnectUser } from './socket.js'

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

import { User } from '../models/User.js'
import { disconnectUser, getIO } from './socket.js'

export async function suspendAccount(userId: string, reportId: string, reason: string): Promise<boolean> {
  const filter = { _id: userId, deletedAt: { $exists: false }, roles: { $nin: ['admin', 'super_admin'] } }
  if (!await User.exists(filter)) return false
  // Retain the originating decision if another report already suspended this user.
  const result = await User.updateOne({ ...filter, suspendedAt: { $exists: false } }, { $set: { suspendedAt: new Date(), suspensionReason: reason, suspensionReportId: reportId } })
  if (!result.matchedCount && !await User.exists({ ...filter, suspendedAt: { $exists: true } })) return false
  try { getIO().to(`user:${userId}`).emit('account:suspended', { suspendedAt: new Date().toISOString() }) } catch { /* Clients can also retrieve status through /users/me. */ }
  // No 'session:revoked': that signs clients out, and a suspended account keeps
  // a restricted session (see suspendedAccess).
  disconnectUser(userId, { notify: false })
  return true
}

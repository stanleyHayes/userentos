import mongoose, { Schema, type Document } from 'mongoose'
import { config } from '../config/index.js'

/**
 * Sessions signed out one device at a time (logout, per-device biometric
 * revoke). Access tokens carry their session family as `sid`, and
 * authenticate, optionalAuth and the socket layer reject a listed sid.
 *
 * A row only has to outlive the access tokens that could carry its sid: the
 * family's refresh credentials are revoked with it, so no new token can be
 * minted for it. It stores no user id.
 */
export interface IRevokedSession extends Document {
  sid: string
  reason?: string
  expiresAt: Date
}

const schema = new Schema<IRevokedSession>({
  sid: { type: String, required: true, unique: true },
  reason: { type: String },
  expiresAt: { type: Date, required: true },
}, { timestamps: true })

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }) // MongoDB TTL

export const RevokedSession = mongoose.model<IRevokedSession>('RevokedSession', schema)

/** A minute past the access-token lifetime, for clock skew between instances. */
const RETAIN_MS = (config.jwtAccessExpiresIn + 60) * 1000

/** Record a device sign-out. Idempotent: a second call only extends the row. */
export async function recordRevokedSession(sid: string, reason: string): Promise<void> {
  const expiresAt = new Date(Date.now() + RETAIN_MS)
  try {
    await RevokedSession.updateOne({ sid }, { $setOnInsert: { reason }, $max: { expiresAt } }, { upsert: true })
  } catch (err) {
    // Two concurrent upserts of one sid: the other one inserted the row.
    if ((err as { code?: number }).code !== 11000) throw err
  }
}

/** True for a signed-out session. Tokens minted before session ids have none. */
export async function isSessionRevoked(sid: unknown): Promise<boolean> {
  if (sid === undefined) return false
  if (typeof sid !== 'string' || !sid) return true
  return Boolean(await RevokedSession.exists({ sid }))
}

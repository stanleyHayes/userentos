import mongoose, { Schema, type Document } from 'mongoose'
import crypto from 'crypto'

/**
 * Server-side record of a long-lived refresh token.
 * The plaintext token never leaves the client after issuance — we only store its SHA-256 hash.
 * Tokens are rotated on use (new token issued, old one revoked) for security.
 */
export interface IRefreshToken extends Document {
  userId: string
  sessionVersion?: number
  /** One sign-in on one device, carried through every rotation. Access tokens
   * carry it as `sid`, so signing that device out can reject them too. */
  familyId?: string
  /** SHA-256 hex digest of the opaque refresh token */
  tokenHash: string
  /** Optional client hint, e.g. 'Chrome 125 / macOS' */
  deviceLabel?: string
  /** IP address that created the token */
  ipAddress?: string
  lastUsedAt?: Date
  expiresAt: Date
  revokedAt?: Date
  revokedReason?: string
  /** Set once, when a rotated token was presented again (see AuthService.refresh). */
  replayDetectedAt?: Date
  /** Set when a just-rotated token was answered once within the grace window. */
  graceUsedAt?: Date
}

const schema = new Schema<IRefreshToken>({
  userId: { type: String, required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  sessionVersion: { type: Number, default: 0, immutable: true },
  familyId: { type: String, immutable: true },
  deviceLabel: { type: String },
  ipAddress: { type: String },
  lastUsedAt: { type: Date },
  // Date — MUST stay a BSON Date or the TTL index below silently never fires
  // (it previously was String, so expired tokens were never auto-deleted).
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date },
  revokedReason: { type: String },
  replayDetectedAt: { type: Date },
  graceUsedAt: { type: Date },
}, { timestamps: true })

schema.index({ userId: 1, revokedAt: 1 })
schema.index({ familyId: 1 })
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }) // MongoDB TTL — auto-delete expired tokens

export const RefreshToken = mongoose.model<IRefreshToken>('RefreshToken', schema)

/** Generate a cryptographically secure opaque refresh token. */
export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

/** Hash a refresh token for storage. */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

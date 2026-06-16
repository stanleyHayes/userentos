import mongoose, { Schema, type Document } from 'mongoose'

/**
 * Server-side record of a long-lived biometric refresh token.
 * The plaintext token never leaves the device after issuance — we only store its SHA-256 hash.
 * Each device gets its own token. Revoking is per-device or per-user.
 */
export interface IBiometricToken extends Document {
  userId: string
  /** SHA-256 hex digest of the opaque refresh token */
  tokenHash: string
  /** Stable per-install device identifier supplied by the client (uuid) */
  deviceId: string
  /** Free-form user-visible label, e.g. "iPhone 15 Pro" */
  deviceLabel?: string
  /** Last time this token was successfully exchanged for a session JWT */
  lastUsedAt?: string
  expiresAt: string
  revokedAt?: string
  revokedReason?: string
}

const schema = new Schema<IBiometricToken>({
  userId: { type: String, required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  deviceId: { type: String, required: true },
  deviceLabel: { type: String },
  lastUsedAt: { type: String },
  expiresAt: { type: String, required: true },
  revokedAt: { type: String },
  revokedReason: { type: String },
}, { timestamps: true })

schema.index({ userId: 1, deviceId: 1 })

export const BiometricToken = mongoose.model<IBiometricToken>('BiometricToken', schema)

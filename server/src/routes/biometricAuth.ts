import { Router } from 'express'
import { z } from 'zod'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { authenticate } from '../middleware/auth.js'
import type { AuthPayload } from '../middleware/auth.js'
import { config } from '../config/index.js'
import { BiometricToken } from '../models/BiometricToken.js'
import { User } from '../models/User.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'

const router = Router()

const REFRESH_TTL_DAYS = 90
const TOKEN_BYTES = 48 // 64 url-safe chars after base64url

function generateOpaqueToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url')
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function isExpired(iso: string): boolean {
  return new Date(iso).getTime() <= Date.now()
}

const idOf = <T extends { _id?: { toString(): string }; id?: string }>(doc: T) => ({ ...doc, id: (doc._id ?? doc.id)?.toString() ?? '' })

// ────────────────────────────────────────
// Enroll a device — exchange a fresh password (re-auth) for a refresh token.
// Auth required. The client should call this immediately after a successful
// password login while the user opts into biometric on this device.
// ────────────────────────────────────────
router.post('/enroll', authenticate, async (req, res) => {
  const schema = z.object({
    deviceId: z.string().min(8).max(128),
    deviceLabel: z.string().max(100).optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.errors[0].message); return }

  // Revoke any existing token for this user+device — only one active token per device.
  await BiometricToken.updateMany(
    { userId: req.user!.userId, deviceId: parsed.data.deviceId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date().toISOString(), revokedReason: 'replaced_by_new_enrollment' } },
  )

  const token = generateOpaqueToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  await BiometricToken.create({
    userId: req.user!.userId,
    tokenHash,
    deviceId: parsed.data.deviceId,
    deviceLabel: parsed.data.deviceLabel,
    expiresAt,
  })

  success(res, { refreshToken: token, expiresAt }, 'Biometric refresh token issued', 201)
})

// ────────────────────────────────────────
// Exchange — POST a refresh token, get back a fresh session JWT + a NEW refresh token.
// Old refresh token is revoked atomically (rotation). No auth needed.
// ────────────────────────────────────────
router.post('/exchange', async (req, res) => {
  const schema = z.object({
    refreshToken: z.string().min(20).max(200),
    deviceId: z.string().min(8).max(128),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.errors[0].message); return }

  const tokenHash = hashToken(parsed.data.refreshToken)
  const record = await BiometricToken.findOne({ tokenHash })
  if (!record) {
    // Token unknown — could be a replay of an already-rotated token. Don't leak which.
    error(res, 'Invalid refresh token', 401)
    return
  }
  if (record.revokedAt) {
    // Replayed an already-rotated token — possible compromise. Revoke ALL of this user's tokens.
    await BiometricToken.updateMany(
      { userId: record.userId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date().toISOString(), revokedReason: 'replay_detected' } },
    )
    error(res, 'Refresh token already used. All biometric sessions for this account have been revoked.', 401)
    return
  }
  if (isExpired(record.expiresAt)) {
    error(res, 'Refresh token expired', 401)
    return
  }
  if (record.deviceId !== parsed.data.deviceId) {
    error(res, 'Device mismatch', 401)
    return
  }

  const user = await User.findById(record.userId)
  if (!user) {
    error(res, 'User no longer exists', 401)
    return
  }

  // Rotate: revoke old, issue new
  record.revokedAt = new Date().toISOString()
  record.revokedReason = 'rotated'
  record.lastUsedAt = new Date().toISOString()
  await record.save()

  const newToken = generateOpaqueToken()
  const newHash = hashToken(newToken)
  const newExpiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
  await BiometricToken.create({
    userId: record.userId,
    tokenHash: newHash,
    deviceId: record.deviceId,
    deviceLabel: record.deviceLabel,
    expiresAt: newExpiresAt,
  })

  // Mint a session JWT (same shape as a normal login)
  const payload: AuthPayload = {
    userId: user._id.toString(),
    email: user.email,
    roles: user.roles,
    permissions: user.permissions || [],
  }
  const sessionToken = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtAccessExpiresIn })
  const safeUser = (user as unknown as { toSafe(): Record<string, unknown> }).toSafe()

  success(res, {
    user: safeUser,
    token: sessionToken,
    refreshToken: newToken,
    refreshExpiresAt: newExpiresAt,
  })
})

// ────────────────────────────────────────
// List my registered biometric devices.
// ────────────────────────────────────────
router.get('/devices', authenticate, async (req, res) => {
  const items = await BiometricToken.find({ userId: req.user!.userId, revokedAt: { $exists: false } })
    .select('deviceId deviceLabel lastUsedAt expiresAt createdAt')
    .lean()
  success(res, { items: items.map(idOf), total: items.length })
})

// ────────────────────────────────────────
// Revoke a specific device (logged-in user).
// ────────────────────────────────────────
router.post('/devices/:id/revoke', authenticate, async (req, res) => {
  const record = await BiometricToken.findById(param(req.params.id))
  if (!record || record.userId !== req.user!.userId) { error(res, 'Device not found', 404); return }
  if (record.revokedAt) { error(res, 'Already revoked'); return }
  record.revokedAt = new Date().toISOString()
  record.revokedReason = 'user_revoked'
  await record.save()
  success(res, idOf(record.toObject()))
})

// ────────────────────────────────────────
// Revoke all biometric sessions for the current user (panic button).
// ────────────────────────────────────────
router.post('/revoke-all', authenticate, async (req, res) => {
  const result = await BiometricToken.updateMany(
    { userId: req.user!.userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date().toISOString(), revokedReason: 'user_revoked_all' } },
  )
  success(res, { revoked: result.modifiedCount })
})

export default router

import { Router } from 'express'
import { z } from 'zod'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { authenticate } from '../middleware/auth.js'
import type { AuthPayload } from '../middleware/auth.js'
import { config } from '../config/index.js'
import { BiometricToken } from '../models/BiometricToken.js'
import { isSessionRevoked } from '../models/RevokedSession.js'
import { disconnectBiometricUser } from '../services/socket.js'
import { ROTATION_GRACE_MS, revokeDeviceSession } from '../services/sessionRevocation.js'
import { sessionVersionFilter, biometricVersionFilter } from '../services/sessionVersion.js'
import { User } from '../models/User.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { loginLimiter } from '../middleware/rateLimit.js'

const router = Router()

const REFRESH_TTL_DAYS = 90
const TOKEN_BYTES = 48 // 64 url-safe chars after base64url

function generateOpaqueToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url')
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

const idOf = <T extends { _id?: { toString(): string }; id?: string }>(doc: T) => ({ ...doc, id: (doc._id ?? doc.id)?.toString() ?? '' })

// ────────────────────────────────────────
// Enroll a device — REQUIRES the current password (re-auth). A stolen
// short-lived access token alone must never mint a 90-day biometric token.
// ────────────────────────────────────────
router.post('/enroll', loginLimiter, authenticate, async (req, res) => {
  const schema = z.object({
    deviceId: z.string().min(8).max(128),
    deviceLabel: z.string().max(100).optional(),
    password: z.string().min(1),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const user = await User.findById(req.user!.userId)
  if (!user) { error(res, 'User not found', 404); return }
  if ((req.user!.sessionVersion ?? 0) !== (user.sessionVersion ?? 0) ||
      (req.user!.biometricVersion !== undefined && req.user!.biometricVersion !== (user.biometricVersion ?? 0))) {
    error(res, 'Session expired. Please log in again.', 401); return
  }
  const validPassword = await bcrypt.compare(parsed.data.password, user.passwordHash)
  if (!validPassword) { error(res, 'Password is incorrect', 401); return }

  // Revoke any existing token for this user+device — only one active token per device.
  await BiometricToken.updateMany(
    { userId: req.user!.userId, deviceId: parsed.data.deviceId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), revokedReason: 'replaced_by_new_enrollment' } },
  )

  const token = generateOpaqueToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000)

  await BiometricToken.create({
    userId: req.user!.userId,
    sessionVersion: req.user!.sessionVersion ?? 0,
    biometricVersion: user.biometricVersion ?? 0,
    // Each enrollment is its own device session (the `sid` of tokens it mints).
    familyId: crypto.randomUUID(),
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
router.post('/exchange', loginLimiter, async (req, res) => {
  const schema = z.object({
    refreshToken: z.string().min(20).max(200),
    deviceId: z.string().min(8).max(128),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const tokenHash = hashToken(parsed.data.refreshToken)

  // Rotate atomically — only the first concurrent exchange can claim the token.
  // Bound to its device: a presentation from anywhere else claims nothing,
  // so it cannot burn the real device's token.
  const record = await BiometricToken.findOneAndUpdate(
    { tokenHash, deviceId: parsed.data.deviceId, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
    { $set: { revokedAt: new Date(), revokedReason: 'rotated', lastUsedAt: new Date() } },
    { returnDocument: 'after' },
  )
  if (!record) {
    // Only a rotated token presented again is replay (see AuthService.refresh
    // for the rules), and only once: the claim flips it to 'replay_detected'.
    // Revoked for any other reason, rotated moments ago, or from an already
    // revoked generation, it is simply refused.
    const rotated = await BiometricToken.findOne({ tokenHash, revokedReason: 'rotated', revokedAt: { $lte: new Date(Date.now() - ROTATION_GRACE_MS) } })
    const current = rotated && await User.exists({ _id: rotated.userId, ...sessionVersionFilter(rotated.sessionVersion ?? 0), ...biometricVersionFilter(rotated.biometricVersion ?? 0) })
    const replayed = current && await BiometricToken.findOneAndUpdate(
      { _id: rotated._id, revokedReason: 'rotated' },
      { $set: { revokedReason: 'replay_detected', replayDetectedAt: new Date() } },
    )
    if (replayed) {
      // Possible compromise. Revoke ALL of this user's biometric tokens.
      await User.updateOne({ _id: replayed.userId }, { $inc: { biometricVersion: 1 } })
      disconnectBiometricUser(replayed.userId)
      await BiometricToken.updateMany(
        { userId: replayed.userId, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date(), revokedReason: 'replay_detected' } },
      )
      error(res, 'Refresh token already used. All biometric sessions for this account have been revoked.', 401)
      return
    }
    // Token unknown, expired, revoked or on another device — don't leak which.
    error(res, 'Invalid refresh token', 401)
    return
  }

  const user = await User.findById(record.userId)
  if (!user ||
      (record.sessionVersion ?? 0) !== (user.sessionVersion ?? 0) ||
      (record.biometricVersion ?? 0) !== (user.biometricVersion ?? 0)) {
    // Claimed but never rotated: presenting it again must not look like replay.
    await BiometricToken.updateOne({ _id: record._id }, { $set: { revokedReason: 'session_revoked' } })
    error(res, user ? 'Invalid refresh token' : 'User no longer exists', 401); return
  }

  // Enrollments from before session families start one here.
  const familyId = record.familyId ?? crypto.randomUUID()
  const newToken = generateOpaqueToken()
  const newHash = hashToken(newToken)
  const newExpiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000)
  await BiometricToken.create({
    userId: record.userId,
    sessionVersion: record.sessionVersion ?? 0,
    biometricVersion: record.biometricVersion ?? 0,
    familyId,
    tokenHash: newHash,
    deviceId: record.deviceId,
    deviceLabel: record.deviceLabel,
    expiresAt: newExpiresAt,
  })
  // The device revoked while this exchange ran: the revoke records the
  // session before revoking the family, so one of the two catches the successor.
  if (record.familyId && await isSessionRevoked(record.familyId)) {
    await BiometricToken.updateOne({ tokenHash: newHash }, { $set: { revokedAt: new Date(), revokedReason: 'user_revoked' } })
    error(res, 'Invalid refresh token', 401); return
  }

  // Mint a session JWT (same shape as a normal login — 'session' purpose required by authenticate)
  const payload: AuthPayload = {
    biometricVersion: record.biometricVersion ?? 0,
    sessionVersion: user.sessionVersion ?? 0,
    sid: familyId,
    userId: user._id.toString(),
    email: user.email,
    roles: user.roles,
    permissions: user.permissions || [],
    activeRole: user.activeRole,
  }
  const sessionToken = jwt.sign({ ...payload, purpose: 'session' }, config.jwtSecret, { expiresIn: config.jwtAccessExpiresIn })
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
// Revoke a specific device (logged-in user). The access tokens that device
// minted from this enrollment stop working and its sockets close too; the
// account's other devices stay signed in.
// ────────────────────────────────────────
router.post('/devices/:id/revoke', authenticate, async (req, res) => {
  const record = await BiometricToken.findById(param(req.params.id))
  if (!record || record.userId !== req.user!.userId) { error(res, 'Device not found', 404); return }
  if (record.familyId) {
    // Revoke the enrollment, not only the listed record: the device may have
    // rotated it by exchanging since the list was fetched.
    const { familyId } = record
    if (!await BiometricToken.exists({ familyId, revokedAt: { $exists: false } })) { error(res, 'Already revoked'); return }
    await revokeDeviceSession(familyId, 'user_revoked')
    await BiometricToken.updateMany(
      { familyId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date(), revokedReason: 'user_revoked' } },
    )
    success(res, idOf((await BiometricToken.findById(record._id).lean()) ?? record.toObject()))
    return
  }
  if (record.revokedAt) { error(res, 'Already revoked'); return }
  record.revokedAt = new Date()
  record.revokedReason = 'user_revoked'
  await record.save()
  success(res, idOf(record.toObject()))
})

// ────────────────────────────────────────
// Revoke all biometric sessions for the current user (panic button).
// ────────────────────────────────────────
router.post('/revoke-all', authenticate, async (req, res) => {
  await User.updateOne({ _id: req.user!.userId }, { $inc: { biometricVersion: 1 } })
  disconnectBiometricUser(req.user!.userId)
  const result = await BiometricToken.updateMany(
    { userId: req.user!.userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), revokedReason: 'user_revoked_all' } },
  )
  success(res, { revoked: result.modifiedCount })
})

export default router

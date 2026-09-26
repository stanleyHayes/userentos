import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import type { Logger } from 'winston'
import { config } from '../config/index.js'
import type { UserRepository, WalletRepository } from '../repositories/index.js'
import type { AuthPayload } from '../middleware/auth.js'
import { notify, notifyWelcome } from './notify.js'
import { sendPasswordResetEmail } from './email.js'
import { RefreshToken, generateRefreshToken, hashRefreshToken } from '../models/RefreshToken.js'
import { BiometricToken } from '../models/BiometricToken.js'
import { DeviceToken } from '../models/DeviceToken.js'
import { User, type IUserConsents } from '../models/User.js'
import { SubscriptionPackage } from '../models/SubscriptionPackage.js'
import { generateTotpSecret, verifyTotp, buildOtpauthUrl } from '../utils/totp.js'
import { sessionVersionFilter } from './sessionVersion.js'
import QRCode from 'qrcode'
import { disconnectUser, disconnectSession } from './socket.js'
import { ROTATION_GRACE_MS, revokeDeviceSession } from './sessionRevocation.js'
import { isSessionRevoked } from '../models/RevokedSession.js'
import { recordAuditEntry } from '../utils/audit.js'

/** The device making an authenticated request: its session family (the
 * access token's `sid`) and label, for a replacement token pair. */
export interface DeviceSession {
  sid?: string
  deviceLabel?: string
}

interface RegisterData {
  email: string
  phone: string
  password: string
  firstName: string
  lastName: string
  role: string
}

function expiresIn(seconds: number) {
  return new Date(Date.now() + seconds * 1000)
}

/** Short-lived download tokens let browser links fetch PDFs without putting a
 * full-power session JWT into URLs (which end up in logs/history). */
const DOWNLOAD_TOKEN_TTL_SECONDS = 5 * 60

/** Bound to the session that minted it: logout-all, a password change or
 * that device signing out also ends its download links. */
export function signDownloadToken(userId: string, sessionVersion: number | undefined, sid?: string): string {
  return jwt.sign({ userId, purpose: 'download', sessionVersion: sessionVersion ?? 0, sid }, config.jwtSecret, {
    expiresIn: DOWNLOAD_TOKEN_TTL_SECONDS,
  })
}

/**
 * A hash at the configured cost, compared against when the email is unknown
 * so an unknown account costs the same bcrypt work as a wrong password — the
 * response time must not reveal which emails are registered. Built lazily
 * (once) so importing this module stays cheap.
 */
let dummyHash: Promise<string> | undefined
function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash(crypto.randomBytes(32).toString('hex'), config.bcryptRounds)
  return dummyHash
}

export class AuthService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly walletRepo: WalletRepository,
    private readonly logger: Logger,
  ) {}

  /** `familyId` is the device's session: new at sign-in, carried through rotation. */
  private async createRefreshToken(userId: string, sessionVersion: number, familyId: string, deviceLabel?: string, ipAddress?: string) {
    const plain = generateRefreshToken()
    const tokenHash = hashRefreshToken(plain)
    await RefreshToken.create({
      userId,
      tokenHash,
      sessionVersion,
      familyId,
      deviceLabel,
      ipAddress,
      expiresAt: expiresIn(config.jwtRefreshExpiresIn),
    })
    return plain
  }

  private signAccessToken(payload: AuthPayload) {
    // 'session' purpose is what `authenticate` requires — without it the token
    // must not work as a general credential (MFA bypass fix).
    return jwt.sign({ ...payload, purpose: 'session' }, config.jwtSecret, { expiresIn: config.jwtAccessExpiresIn })
  }

  /** Best-effort audit record for an authentication event (never throws). */
  private audit(action: string, userId: string, ipAddress?: string, details?: Record<string, unknown>) {
    void recordAuditEntry({ userId, action, entityType: 'User', entityId: userId === 'anonymous' ? 'unknown' : userId, details, ipAddress })
  }

  /**
   * Tell the account holder about a credential change — exempt 'security'
   * category, so it is delivered whatever their notification toggles.
   */
  private securityNotice(userId: string, title: string, message: string) {
    try {
      void notify({ userId, title, message, actionUrl: '/settings?tab=security', category: 'security' })
    } catch (err) {
      this.logger.warn(`Security notice failed for ${userId}: ${(err as Error).message}`)
    }
  }

  /** Evidence trail for each acceptance; User.consents keeps only the latest. */
  private auditConsent(userId: string, consent: IUserConsents, context: 'register' | 'invitation' | 'renewal') {
    void recordAuditEntry({
      userId,
      action: 'consent.accept',
      entityType: 'User',
      entityId: userId,
      details: {
        context,
        termsVersion: consent.termsVersion,
        privacyVersion: consent.privacyVersion,
        ageConfirmed: consent.ageConfirmed,
        userAgent: consent.userAgent,
      },
      ipAddress: consent.ip,
    })
  }

  async register(data: RegisterData, deviceLabel: string | undefined, ipAddress: string | undefined, consent: IUserConsents) {
    const { email, phone, password, firstName, lastName, role } = data

    const existing = await this.userRepo.findByEmail(email)
    if (existing) {
      this.logger.warn(`Registration attempt with existing email: ${email}`)
      return { error: 'Email already registered', status: 409 }
    }

    const passwordHash = await bcrypt.hash(password, config.bcryptRounds)
    const user = await this.userRepo.create({
      email,
      phone,
      firstName,
      lastName,
      passwordHash,
      roles: [role],
      activeRole: role,
      consents: consent,
    })
    this.auditConsent(user._id.toString(), consent, 'register')

    await this.walletRepo.create({ userId: user._id.toString(), balance: 0, transactions: [] })

    // Landlords/managers list properties, which are gated by subscription
    // packages — assign the default (free Starter) package up front so the
    // listing limit applies from day one. No end date: the free tier doesn't
    // expire.
    if (role === 'landlord' || role === 'property_manager') {
      try {
        const defaultPkg = await SubscriptionPackage.findOne({ isDefault: true, isActive: true }).lean()
        if (defaultPkg) {
          await User.updateOne(
            { _id: user._id },
            { $set: { subscriptionPackageId: defaultPkg._id.toString(), subscriptionStartDate: new Date() } },
          )
        }
      } catch (err) {
        this.logger.warn(`Default package assignment failed for ${email}: ${(err as Error).message}`)
      }
    }

    const sid = crypto.randomUUID()
    const payload: AuthPayload = { sessionVersion: user.sessionVersion ?? 0, sid, userId: user._id.toString(), email, roles: [role], permissions: user.permissions || [], activeRole: role }
    const token = this.signAccessToken(payload)
    const refreshToken = await this.createRefreshToken(user._id.toString(), user.sessionVersion ?? 0, sid, deviceLabel, ipAddress)

    const safeUser = (user as unknown as { toSafe(): Record<string, unknown> }).toSafe()
    this.logger.info(`User registered: ${email} (${role})`)

    // Welcome notification (in_app + email) — best-effort; a transient failure
    // must not become an unhandled rejection (process-fatal without Sentry).
    notifyWelcome(user._id.toString(), firstName).catch((err) =>
      this.logger.warn(`Welcome notification failed for ${email}: ${(err as Error).message}`),
    )

    return { data: { user: safeUser, token, refreshToken }, status: 201 }
  }

  async login(email: string, password: string, deviceLabel?: string, ipAddress?: string) {
    const user = await this.userRepo.findByEmail(email)
    if (!user) {
      // Same bcrypt cost as a real comparison — see getDummyHash.
      await bcrypt.compare(password, await getDummyHash())
      this.logger.warn(`Login attempt with unknown email: ${email}`)
      // The attempted address is not stored: it may be a typo of someone
      // else's email. The IP is what an investigation needs.
      this.audit('auth.login.failure', 'anonymous', ipAddress, { reason: 'unknown_account' })
      return { error: 'Invalid email or password', status: 401 }
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      this.logger.warn(`Failed login attempt for: ${email}`)
      this.audit('auth.login.failure', user._id.toString(), ipAddress, { reason: 'bad_password' })
      return { error: 'Invalid email or password', status: 401 }
    }

    // MFA challenge: password is valid but a TOTP code is still required.
    if (user.mfaEnabled) {
      const mfaToken = jwt.sign(
        { userId: user._id.toString(), purpose: 'mfa', sessionVersion: user.sessionVersion ?? 0 },
        config.jwtSecret,
        { expiresIn: 300 },
      )
      this.logger.info(`MFA challenge issued for: ${email}`)
      this.audit('auth.login.mfa_challenge', user._id.toString(), ipAddress)
      return { data: { mfaRequired: true, mfaToken } }
    }

    const sid = crypto.randomUUID()
    const payload: AuthPayload = { sessionVersion: user.sessionVersion ?? 0, sid, userId: user._id.toString(), email: user.email, roles: user.roles, permissions: user.permissions || [], activeRole: user.activeRole }
    const token = this.signAccessToken(payload)
    const refreshToken = await this.createRefreshToken(user._id.toString(), user.sessionVersion ?? 0, sid, deviceLabel, ipAddress)

    const safeUser = (user as unknown as { toSafe(): Record<string, unknown> }).toSafe()
    this.logger.info(`User logged in: ${email}`)
    this.audit('auth.login.success', user._id.toString(), ipAddress, { method: 'password', device: deviceLabel })

    return { data: { user: safeUser, token, refreshToken } }
  }

  /** Second step of login for MFA-enabled accounts: verify the TOTP code. */
  async verifyMfaLogin(mfaToken: string, code: string, deviceLabel?: string, ipAddress?: string) {
    let userId: string
    let challengeVersion: number
    try {
      const payload = jwt.verify(mfaToken, config.jwtSecret) as { purpose?: string; userId?: string; sessionVersion?: number }
      challengeVersion = payload.sessionVersion === undefined ? 0 : payload.sessionVersion
      if (!Number.isSafeInteger(challengeVersion) || challengeVersion < 0) throw new Error('Invalid MFA session version')
      if (payload.purpose !== 'mfa' || !payload.userId) throw new Error('Invalid token purpose')
      userId = payload.userId
    } catch {
      return { error: 'MFA session expired. Please log in again.', status: 401 }
    }

    const user = await this.userRepo.findById(userId, { select: '+mfaSecret' })
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      return { error: 'MFA is not enabled for this account', status: 400 }
    }

    if ((user.sessionVersion ?? 0) !== challengeVersion) {
      return { error: 'MFA session expired. Please log in again.', status: 401 }
    }

    if (!verifyTotp(user.mfaSecret, code)) {
      this.logger.warn(`Failed MFA attempt for user: ${userId}`)
      this.audit('auth.login.failure', userId, ipAddress, { reason: 'bad_mfa_code' })
      return { error: 'Invalid authentication code', status: 401 }
    }

    const sid = crypto.randomUUID()
    const payload: AuthPayload = { sessionVersion: user.sessionVersion ?? 0, sid, userId: user._id.toString(), email: user.email, roles: user.roles, permissions: user.permissions || [], activeRole: user.activeRole }
    const token = this.signAccessToken(payload)
    const refreshToken = await this.createRefreshToken(user._id.toString(), user.sessionVersion ?? 0, sid, deviceLabel, ipAddress)

    const safeUser = (user as unknown as { toSafe(): Record<string, unknown> }).toSafe()
    this.logger.info(`User logged in with MFA: ${user.email}`)
    this.audit('auth.login.success', user._id.toString(), ipAddress, { method: 'password+totp', device: deviceLabel })

    return { data: { user: safeUser, token, refreshToken } }
  }

  /** Record acceptance of the current Terms/Privacy versions for a signed-in user. */
  async acceptConsents(userId: string, consent: IUserConsents) {
    const result = await User.updateOne({ _id: userId }, { $set: { consents: consent } })
    if (!result.matchedCount) return { error: 'User not found', status: 404 }
    this.auditConsent(userId, consent, 'renewal')
    return {
      data: {
        consents: {
          termsVersion: consent.termsVersion,
          privacyVersion: consent.privacyVersion,
          acceptedAt: consent.acceptedAt,
          ageConfirmed: consent.ageConfirmed,
        },
        consentRequired: false,
      },
    }
  }

  /** Start MFA enrollment: generate a pending secret + QR code (not yet enabled). */
  async mfaSetup(userId: string) {
    const user = await this.userRepo.findById(userId)
    if (!user) return { error: 'User not found', status: 404 }
    if (user.mfaEnabled) return { error: 'MFA is already enabled', status: 400 }

    const secret = generateTotpSecret()
    user.mfaSecret = secret
    await user.save()

    const otpauthUrl = buildOtpauthUrl(secret, user.email)
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 })

    return { data: { secret, otpauthUrl, qrDataUrl } }
  }

  /** Confirm MFA enrollment by verifying a code against the pending secret.
   * Signs every other session out (one may predate the second factor) and
   * returns a fresh token pair for this device. */
  async mfaEnable(userId: string, code: string, ipAddress?: string, device: DeviceSession = {}) {
    const user = await this.userRepo.findById(userId, { select: '+mfaSecret' })
    if (!user) return { error: 'User not found', status: 404 }
    if (user.mfaEnabled) return { error: 'MFA is already enabled', status: 400 }
    if (!user.mfaSecret) return { error: 'MFA setup has not been started', status: 400 }

    if (!verifyTotp(user.mfaSecret, code)) {
      return { error: 'Invalid authentication code', status: 401 }
    }

    user.mfaEnabled = true
    await user.save()
    const tokens = await this.renewAfterRevokingAll(userId, 'mfa_changed', device, ipAddress)
    this.logger.info(`MFA enabled for user: ${user.email}`)
    this.audit('auth.mfa.enable', userId, ipAddress)
    this.securityNotice(userId, 'Two-factor authentication turned on', 'Two-factor authentication was turned on for your RentOS account and your other devices were signed out. If this was not you, reset your password and contact support now.')
    return { data: tokens, message: 'Two-factor authentication enabled' }
  }

  /** Disable MFA — requires a valid code from the current secret. Like
   * enabling it, signs the other sessions out and renews this device's. */
  async mfaDisable(userId: string, code: string, ipAddress?: string, device: DeviceSession = {}) {
    const user = await this.userRepo.findById(userId, { select: '+mfaSecret' })
    if (!user) return { error: 'User not found', status: 404 }
    if (!user.mfaEnabled || !user.mfaSecret) return { error: 'MFA is not enabled', status: 400 }

    if (!verifyTotp(user.mfaSecret, code)) {
      return { error: 'Invalid authentication code', status: 401 }
    }

    user.mfaEnabled = false
    user.mfaSecret = undefined
    await user.save()
    const tokens = await this.renewAfterRevokingAll(userId, 'mfa_changed', device, ipAddress)
    this.logger.info(`MFA disabled for user: ${user.email}`)
    this.audit('auth.mfa.disable', userId, ipAddress)
    this.securityNotice(userId, 'Two-factor authentication turned off', 'Two-factor authentication was turned off for your RentOS account and your other devices were signed out. If this was not you, reset your password and contact support now.')
    return { data: tokens, message: 'Two-factor authentication disabled' }
  }

  async refresh(plainRefreshToken: string, deviceLabel?: string, ipAddress?: string) {
    const tokenHash = hashRefreshToken(plainRefreshToken)

    // Rotate atomically: only the first concurrent request can claim the token.
    const record = await RefreshToken.findOneAndUpdate(
      { tokenHash, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
      { $set: { revokedAt: new Date(), revokedReason: 'rotated', lastUsedAt: new Date() } },
      { returnDocument: 'after' },
    )

    if (!record) {
      const replayedBy = await this.claimReplay(tokenHash)
      if (replayedBy) this.logger.warn(`Refresh-token replay detected for user: ${replayedBy} — all sessions revoked`)
      else this.logger.warn('Refresh attempt with an invalid, expired or revoked token')
      return { error: 'Invalid or expired refresh token', status: 401 }
    }

    const user = await this.userRepo.findById(record.userId)
    if (!user || (record.sessionVersion ?? 0) !== (user.sessionVersion ?? 0)) {
      // Claimed but never rotated (no successor exists): presenting it again
      // later must not look like replay of a rotated token.
      await RefreshToken.updateOne({ _id: record._id }, { $set: { revokedReason: 'session_revoked' } })
      return user ? { error: 'Invalid or expired refresh token', status: 401 } : { error: 'User not found', status: 404 }
    }

    // Tokens issued before session families existed start one here.
    const familyId = record.familyId ?? crypto.randomUUID()
    const payload: AuthPayload = { sessionVersion: user.sessionVersion ?? 0, sid: familyId, userId: user._id.toString(), email: user.email, roles: user.roles, permissions: user.permissions || [], activeRole: user.activeRole }
    const token = this.signAccessToken(payload)
    const newRefreshToken = await this.createRefreshToken(user._id.toString(), user.sessionVersion ?? 0, familyId, deviceLabel, ipAddress)
    // This device signing out while the rotation ran: logout records the
    // session before revoking the family, so either the successor exists in
    // time for that revocation or the record is visible here.
    if (record.familyId && await isSessionRevoked(record.familyId)) {
      await RefreshToken.updateOne({ tokenHash: hashRefreshToken(newRefreshToken) }, { $set: { revokedAt: new Date(), revokedReason: 'logout' } })
      return { error: 'Invalid or expired refresh token', status: 401 }
    }

    this.logger.info(`Token refreshed for user: ${user._id}`)
    return { data: { token, refreshToken: newRefreshToken } }
  }

  /**
   * A rotated refresh token presented again means someone else holds a copy
   * of the chain: revoke every session, once. Nothing else counts. A token
   * revoked for any other reason (logout, logout-all, password change) is
   * simply dead; one rotated under ROTATION_GRACE_MS ago is taken for a
   * retried request whose response was lost; and one from an earlier session
   * generation belongs to a chain that is already revoked. The claim flips
   * the token to 'replay_detected', so a second presentation is inert.
   * Returns the account id when it revoked.
   */
  private async claimReplay(tokenHash: string): Promise<string | null> {
    const rotated = await RefreshToken.findOne({ tokenHash, revokedReason: 'rotated', revokedAt: { $lte: new Date(Date.now() - ROTATION_GRACE_MS) } })
    if (!rotated || !await User.exists({ _id: rotated.userId, ...sessionVersionFilter(rotated.sessionVersion ?? 0) })) return null
    const claimed = await RefreshToken.findOneAndUpdate(
      { _id: rotated._id, revokedReason: 'rotated' },
      { $set: { revokedReason: 'replay_detected', replayDetectedAt: new Date() } },
    )
    if (!claimed) return null
    await this.revokeAllSessions(rotated.userId, 'replay_detected')
    return rotated.userId
  }

  /**
   * Sign every session out, then give the calling device a fresh pair at the
   * new generation so it stays signed in. Its own sockets close quietly
   * first: a 'session:revoked' would have the client sign itself out before
   * the new pair arrives. The client reconnects with the new token.
   */
  private async renewAfterRevokingAll(userId: string, reason: string, device: DeviceSession, ipAddress?: string) {
    if (device.sid) disconnectSession(device.sid, { notify: false })
    await this.revokeAllSessions(userId, reason)
    const user = await this.userRepo.findById(userId)
    if (!user) return null
    const sid = crypto.randomUUID()
    const payload: AuthPayload = { sessionVersion: user.sessionVersion ?? 0, sid, userId, email: user.email, roles: user.roles, permissions: user.permissions || [], activeRole: user.activeRole }
    return {
      token: this.signAccessToken(payload),
      refreshToken: await this.createRefreshToken(userId, user.sessionVersion ?? 0, sid, device.deviceLabel, ipAddress),
    }
  }

  /** Revoke refresh/biometric credentials and remove current push enrollments. */
  private async revokeAllSessions(userId: string, reason: string) {
    const now = new Date()
    await User.updateOne({ _id: userId }, { $inc: { sessionVersion: 1 } })
    disconnectUser(userId)
    await Promise.all([
      DeviceToken.deleteMany({ userId }),
      RefreshToken.updateMany(
        { userId, revokedAt: { $exists: false } },
        { $set: { revokedAt: now, revokedReason: reason } },
      ),
      BiometricToken.updateMany(
        { userId, revokedAt: { $exists: false } },
        { $set: { revokedAt: now, revokedReason: reason } },
      ),
    ])
  }

  /**
   * Sign this device out: its whole session family, not only the token
   * presented (a concurrent refresh may already have rotated it), plus its
   * access tokens and sockets. Other devices stay signed in.
   */
  async logout(plainRefreshToken: string) {
    const tokenHash = hashRefreshToken(plainRefreshToken)
    const record = await RefreshToken.findOne({ tokenHash })
    if (record?.familyId) {
      await revokeDeviceSession(record.familyId, 'logout')
      await RefreshToken.updateMany(
        { familyId: record.familyId, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date(), revokedReason: 'logout' } },
      )
      this.logger.info(`Session signed out (logout) for user: ${record.userId}`)
    } else if (record && !record.revokedAt) {
      // Issued before session families: only this token can be revoked.
      record.revokedAt = new Date()
      record.revokedReason = 'logout'
      await record.save()
      this.logger.info(`Refresh token revoked (logout) for user: ${record.userId}`)
    }
    return { data: null }
  }

  /** `currentSid` is the calling device, whose client signs itself out: its
   * sockets close without a 'session:revoked' racing that. */
  async logoutAll(userId: string, currentSid?: string) {
    if (currentSid) disconnectSession(currentSid, { notify: false })
    await this.revokeAllSessions(userId, 'logout_all')
    this.logger.info(`All sessions revoked for user: ${userId}`)
    return { data: null }
  }

  /** Signs every other session out and returns a fresh pair for this device. */
  async changePassword(userId: string, currentPassword: string, newPassword: string, ipAddress?: string, device: DeviceSession = {}) {
    const user = await this.userRepo.findById(userId)
    if (!user) {
      return { error: 'User not found', status: 404 }
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) {
      this.logger.warn(`Failed password change attempt for user: ${userId}`)
      this.audit('auth.password.change_failed', userId, ipAddress)
      return { error: 'Current password is incorrect', status: 401 }
    }

    user.passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds)
    user.credentialsChangedAt = new Date()
    await user.save()

    // Credential change must kill every existing session, including any an
    // attacker may hold — this is the classic post-compromise action. The
    // device that made the change gets a fresh session in its place.
    const tokens = await this.renewAfterRevokingAll(userId, 'credentials_changed', device, ipAddress)

    this.logger.info(`Password changed for user: ${userId}`)
    this.audit('auth.password.change', userId, ipAddress)
    this.securityNotice(userId, 'Your password was changed', 'The password for your RentOS account was changed and your other devices were signed out. If this was not you, reset your password and contact support now.')
    return { data: tokens, message: 'Password changed successfully' }
  }

  async forgotPassword(email: string, ipAddress?: string) {
    const user = await this.userRepo.findByEmail(email)
    if (!user) {
      // Don't reveal whether email exists
      this.logger.info(`Password reset requested for unknown email: ${email}`)
      return { data: null, message: 'If that email is registered, a reset link has been sent.' }
    }

    const resetToken = jwt.sign(
      { userId: user._id.toString(), purpose: 'reset' },
      config.jwtSecret,
      { expiresIn: 3600 },
    )

    this.logger.info(`Password reset token generated for: ${email}`)
    this.audit('auth.password.reset_requested', user._id.toString(), ipAddress)

    // Send asynchronously so the response time doesn't reveal whether the
    // email exists (timing oracle) and SMTP latency can't stall the request.
    sendPasswordResetEmail(user.email, resetToken).catch((err: unknown) => {
      this.logger.error(`Failed to send password reset email to ${email}: ${(err as Error).message}`)
    })

    return { data: null, message: 'If that email is registered, a reset link has been sent.' }
  }

  async resetPassword(token: string, newPassword: string, ipAddress?: string) {
    let userId: string
    let tokenIat: number | undefined
    try {
      const payload = jwt.verify(token, config.jwtSecret) as { purpose?: string; userId?: string; iat?: number }
      if (payload.purpose !== 'reset') throw new Error('Invalid token purpose')
      userId = payload.userId!
      tokenIat = payload.iat
    } catch {
      return { error: 'Invalid or expired reset token', status: 401 }
    }

    const user = await this.userRepo.findById(userId)
    if (!user) {
      return { error: 'User not found', status: 404 }
    }

    // Single-use: any credential change (including a previous reset) issued
    // after this token invalidates it.
    if (user.credentialsChangedAt && tokenIat && tokenIat * 1000 < user.credentialsChangedAt.getTime()) {
      return { error: 'Invalid or expired reset token', status: 401 }
    }

    user.passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds)
    user.credentialsChangedAt = new Date()
    await user.save()

    // Recovery complete — every existing session (attacker's included) dies,
    // and this unauthenticated flow issues none: the user signs in again.
    await this.revokeAllSessions(userId, 'credentials_changed')

    this.logger.info(`Password reset completed for user: ${userId}`)
    this.audit('auth.password.reset', userId, ipAddress)
    this.securityNotice(userId, 'Your password was reset', 'The password for your RentOS account was reset and you were signed out on all devices. If this was not you, contact support now.')
    return { data: null, message: 'Password reset successfully' }
  }
}

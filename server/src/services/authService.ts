import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { Logger } from 'winston'
import { config } from '../config/index.js'
import type { UserRepository, WalletRepository } from '../repositories/index.js'
import type { AuthPayload } from '../middleware/auth.js'
import { notifyWelcome } from './notify.js'
import { sendPasswordResetEmail } from './email.js'
import { RefreshToken, generateRefreshToken, hashRefreshToken } from '../models/RefreshToken.js'
import { BiometricToken } from '../models/BiometricToken.js'
import { generateTotpSecret, verifyTotp, buildOtpauthUrl } from '../utils/totp.js'
import QRCode from 'qrcode'

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

export function signDownloadToken(userId: string): string {
  return jwt.sign({ userId, purpose: 'download' }, config.jwtSecret, {
    expiresIn: DOWNLOAD_TOKEN_TTL_SECONDS,
  })
}

export class AuthService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly walletRepo: WalletRepository,
    private readonly logger: Logger,
  ) {}

  private async createRefreshToken(userId: string, deviceLabel?: string, ipAddress?: string) {
    const plain = generateRefreshToken()
    const tokenHash = hashRefreshToken(plain)
    await RefreshToken.create({
      userId,
      tokenHash,
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

  async register(data: RegisterData, deviceLabel?: string, ipAddress?: string) {
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
    })

    await this.walletRepo.create({ userId: user._id.toString(), balance: 0, transactions: [] })

    const payload: AuthPayload = { userId: user._id.toString(), email, roles: [role], permissions: user.permissions || [], activeRole: role }
    const token = this.signAccessToken(payload)
    const refreshToken = await this.createRefreshToken(user._id.toString(), deviceLabel, ipAddress)

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
      this.logger.warn(`Login attempt with unknown email: ${email}`)
      return { error: 'Invalid email or password', status: 401 }
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      this.logger.warn(`Failed login attempt for: ${email}`)
      return { error: 'Invalid email or password', status: 401 }
    }

    // MFA challenge: password is valid but a TOTP code is still required.
    if (user.mfaEnabled) {
      const mfaToken = jwt.sign(
        { userId: user._id.toString(), purpose: 'mfa' },
        config.jwtSecret,
        { expiresIn: 300 },
      )
      this.logger.info(`MFA challenge issued for: ${email}`)
      return { data: { mfaRequired: true, mfaToken } }
    }

    const payload: AuthPayload = { userId: user._id.toString(), email: user.email, roles: user.roles, permissions: user.permissions || [], activeRole: user.activeRole }
    const token = this.signAccessToken(payload)
    const refreshToken = await this.createRefreshToken(user._id.toString(), deviceLabel, ipAddress)

    const safeUser = (user as unknown as { toSafe(): Record<string, unknown> }).toSafe()
    this.logger.info(`User logged in: ${email}`)

    return { data: { user: safeUser, token, refreshToken } }
  }

  /** Second step of login for MFA-enabled accounts: verify the TOTP code. */
  async verifyMfaLogin(mfaToken: string, code: string, deviceLabel?: string, ipAddress?: string) {
    let userId: string
    try {
      const payload = jwt.verify(mfaToken, config.jwtSecret) as { purpose?: string; userId?: string }
      if (payload.purpose !== 'mfa' || !payload.userId) throw new Error('Invalid token purpose')
      userId = payload.userId
    } catch {
      return { error: 'MFA session expired. Please log in again.', status: 401 }
    }

    const user = await this.userRepo.findById(userId, { select: '+mfaSecret' })
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      return { error: 'MFA is not enabled for this account', status: 400 }
    }

    if (!verifyTotp(user.mfaSecret, code)) {
      this.logger.warn(`Failed MFA attempt for user: ${userId}`)
      return { error: 'Invalid authentication code', status: 401 }
    }

    const payload: AuthPayload = { userId: user._id.toString(), email: user.email, roles: user.roles, permissions: user.permissions || [], activeRole: user.activeRole }
    const token = this.signAccessToken(payload)
    const refreshToken = await this.createRefreshToken(user._id.toString(), deviceLabel, ipAddress)

    const safeUser = (user as unknown as { toSafe(): Record<string, unknown> }).toSafe()
    this.logger.info(`User logged in with MFA: ${user.email}`)

    return { data: { user: safeUser, token, refreshToken } }
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

  /** Confirm MFA enrollment by verifying a code against the pending secret. */
  async mfaEnable(userId: string, code: string) {
    const user = await this.userRepo.findById(userId, { select: '+mfaSecret' })
    if (!user) return { error: 'User not found', status: 404 }
    if (user.mfaEnabled) return { error: 'MFA is already enabled', status: 400 }
    if (!user.mfaSecret) return { error: 'MFA setup has not been started', status: 400 }

    if (!verifyTotp(user.mfaSecret, code)) {
      return { error: 'Invalid authentication code', status: 401 }
    }

    user.mfaEnabled = true
    await user.save()
    this.logger.info(`MFA enabled for user: ${user.email}`)
    return { data: null, message: 'Two-factor authentication enabled' }
  }

  /** Disable MFA — requires a valid code from the current secret. */
  async mfaDisable(userId: string, code: string) {
    const user = await this.userRepo.findById(userId, { select: '+mfaSecret' })
    if (!user) return { error: 'User not found', status: 404 }
    if (!user.mfaEnabled || !user.mfaSecret) return { error: 'MFA is not enabled', status: 400 }

    if (!verifyTotp(user.mfaSecret, code)) {
      return { error: 'Invalid authentication code', status: 401 }
    }

    user.mfaEnabled = false
    user.mfaSecret = undefined
    await user.save()
    this.logger.info(`MFA disabled for user: ${user.email}`)
    return { data: null, message: 'Two-factor authentication disabled' }
  }

  async refresh(plainRefreshToken: string, deviceLabel?: string, ipAddress?: string) {
    const tokenHash = hashRefreshToken(plainRefreshToken)

    // Rotate atomically: only the first concurrent request can claim the token.
    const record = await RefreshToken.findOneAndUpdate(
      { tokenHash, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
      { $set: { revokedAt: new Date(), revokedReason: 'rotated', lastUsedAt: new Date() } },
      { new: true },
    )

    if (!record) {
      // Distinguish replay of a revoked/expired token from a genuinely unknown one:
      // a replay means the token chain may be compromised — nuke all user sessions.
      const existing = await RefreshToken.findOne({ tokenHash })
      if (existing?.revokedAt) {
        await this.revokeAllSessions(existing.userId, 'replay_detected')
        this.logger.warn(`Refresh-token replay detected for user: ${existing.userId} — all sessions revoked`)
      } else {
        this.logger.warn('Refresh attempt with invalid or expired token')
      }
      return { error: 'Invalid or expired refresh token', status: 401 }
    }

    const user = await this.userRepo.findById(record.userId)
    if (!user) {
      return { error: 'User not found', status: 404 }
    }

    const payload: AuthPayload = { userId: user._id.toString(), email: user.email, roles: user.roles, permissions: user.permissions || [], activeRole: user.activeRole }
    const token = this.signAccessToken(payload)
    const newRefreshToken = await this.createRefreshToken(user._id.toString(), deviceLabel, ipAddress)

    this.logger.info(`Token refreshed for user: ${user._id}`)
    return { data: { token, refreshToken: newRefreshToken } }
  }

  /** Revoke every session credential the user holds (refresh + biometric). */
  private async revokeAllSessions(userId: string, reason: string) {
    const now = new Date()
    await Promise.all([
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

  async logout(plainRefreshToken: string) {
    const tokenHash = hashRefreshToken(plainRefreshToken)
    const record = await RefreshToken.findOne({ tokenHash })
    if (record && !record.revokedAt) {
      record.revokedAt = new Date()
      record.revokedReason = 'logout'
      await record.save()
      this.logger.info(`Refresh token revoked (logout) for user: ${record.userId}`)
    }
    return { data: null }
  }

  async logoutAll(userId: string) {
    await this.revokeAllSessions(userId, 'logout_all')
    this.logger.info(`All sessions revoked for user: ${userId}`)
    return { data: null }
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userRepo.findById(userId)
    if (!user) {
      return { error: 'User not found', status: 404 }
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) {
      this.logger.warn(`Failed password change attempt for user: ${userId}`)
      return { error: 'Current password is incorrect', status: 401 }
    }

    user.passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds)
    user.credentialsChangedAt = new Date()
    await user.save()

    // Credential change must kill every existing session, including any an
    // attacker may hold — this is the classic post-compromise action.
    await this.revokeAllSessions(userId, 'credentials_changed')

    this.logger.info(`Password changed for user: ${userId}`)
    return { data: null, message: 'Password changed successfully' }
  }

  async forgotPassword(email: string) {
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

    // Send asynchronously so the response time doesn't reveal whether the
    // email exists (timing oracle) and SMTP latency can't stall the request.
    sendPasswordResetEmail(user.email, resetToken).catch((err: unknown) => {
      this.logger.error(`Failed to send password reset email to ${email}: ${(err as Error).message}`)
    })

    return { data: null, message: 'If that email is registered, a reset link has been sent.' }
  }

  async resetPassword(token: string, newPassword: string) {
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

    // Recovery complete — every existing session (attacker's included) dies.
    await this.revokeAllSessions(userId, 'credentials_changed')

    this.logger.info(`Password reset completed for user: ${userId}`)
    return { data: null, message: 'Password reset successfully' }
  }
}

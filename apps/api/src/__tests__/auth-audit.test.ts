import { describe, it, expect, vi, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'
import { config } from '../config/index.js'

/*
 * Security hygiene (Act 1038 / audit trail): sign-ins, MFA changes and
 * password changes must leave an audit record, and a login for an unknown
 * email must cost the same bcrypt work as a wrong password so response time
 * does not reveal which emails have accounts.
 */

const { recordAuditEntry, notify, compare, verifyTotp } = vi.hoisted(() => ({
  recordAuditEntry: vi.fn().mockResolvedValue(undefined),
  notify: vi.fn().mockResolvedValue(true),
  compare: vi.fn(),
  verifyTotp: vi.fn(),
}))
vi.mock('../utils/audit.js', () => ({ recordAuditEntry }))
vi.mock('../services/notify.js', () => ({ notify, notifyWelcome: vi.fn().mockResolvedValue(true) }))
vi.mock('bcryptjs', () => ({ default: { compare, hash: vi.fn().mockResolvedValue('$2a$04$dummyhashdummyhashdummyhashdummyhashdummyhashdummyha') } }))
vi.mock('../utils/totp.js', () => ({ verifyTotp, generateTotpSecret: vi.fn(), buildOtpauthUrl: vi.fn() }))
vi.mock('../services/socket.js', () => ({ disconnectUser: vi.fn() }))
vi.mock('../services/email.js', () => ({ sendPasswordResetEmail: vi.fn().mockResolvedValue(true) }))
vi.mock('../models/RefreshToken.js', async (importActual) => ({
  ...await importActual<typeof import('../models/RefreshToken.js')>(),
  RefreshToken: { create: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({}) },
}))
vi.mock('../models/BiometricToken.js', () => ({ BiometricToken: { updateMany: vi.fn().mockResolvedValue({}) } }))
vi.mock('../models/DeviceToken.js', () => ({ DeviceToken: { deleteMany: vi.fn().mockResolvedValue({}) } }))
vi.mock('../models/User.js', () => ({ User: { updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }) } }))

const { AuthService } = await import('../services/authService.js')

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => 'user-1' },
    email: 'ama@example.com',
    passwordHash: '$2a$04$realhash',
    roles: ['tenant'],
    activeRole: 'tenant',
    permissions: [],
    mfaEnabled: false,
    mfaSecret: undefined as string | undefined,
    sessionVersion: 0,
    save: vi.fn().mockResolvedValue(undefined),
    toSafe: () => ({ id: 'user-1' }),
    ...overrides,
  }
}

const repo = { findByEmail: vi.fn(), findById: vi.fn() }
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const service = new AuthService(repo as never, {} as never, logger as never)
const IP = '203.0.113.9'

const actions = () => recordAuditEntry.mock.calls.map(([entry]) => entry as { action: string; userId: string; details?: Record<string, unknown>; ipAddress?: string })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('login audit and timing', () => {
  it('runs a dummy bcrypt comparison for an unknown email and audits the failure without the email', async () => {
    repo.findByEmail.mockResolvedValue(null)
    compare.mockResolvedValue(false)
    const result = await service.login('nobody@example.com', 'Guess!123', undefined, IP)
    expect(result).toMatchObject({ status: 401, error: 'Invalid email or password' })
    expect(compare).toHaveBeenCalledOnce()
    expect(compare.mock.calls[0][0]).toBe('Guess!123')
    expect(actions()).toEqual([expect.objectContaining({ action: 'auth.login.failure', userId: 'anonymous', ipAddress: IP, details: { reason: 'unknown_account' } })])
    expect(JSON.stringify(recordAuditEntry.mock.calls)).not.toContain('nobody@example.com')
  })

  it('audits a wrong password against the account', async () => {
    repo.findByEmail.mockResolvedValue(makeUser())
    compare.mockResolvedValue(false)
    expect(await service.login('ama@example.com', 'wrong', undefined, IP)).toMatchObject({ status: 401 })
    expect(actions()).toEqual([expect.objectContaining({ action: 'auth.login.failure', userId: 'user-1', details: { reason: 'bad_password' } })])
  })

  it('audits a successful sign-in', async () => {
    repo.findByEmail.mockResolvedValue(makeUser())
    compare.mockResolvedValue(true)
    const result = await service.login('ama@example.com', 'right', 'Pixel 8', IP)
    expect(result.data).toHaveProperty('token')
    expect(actions()).toEqual([expect.objectContaining({ action: 'auth.login.success', userId: 'user-1', ipAddress: IP, details: { method: 'password', device: 'Pixel 8' } })])
  })

  it('audits the MFA step: challenge, bad code, success', async () => {
    const user = makeUser({ mfaEnabled: true, mfaSecret: 'SECRET' })
    repo.findByEmail.mockResolvedValue(user)
    repo.findById.mockResolvedValue(user)
    compare.mockResolvedValue(true)
    const challenge = await service.login('ama@example.com', 'right', undefined, IP)
    expect(challenge.data).toMatchObject({ mfaRequired: true })

    const mfaToken = jwt.sign({ userId: 'user-1', purpose: 'mfa', sessionVersion: 0 }, config.jwtSecret, { expiresIn: 300 })
    verifyTotp.mockReturnValueOnce(false)
    expect(await service.verifyMfaLogin(mfaToken, '000000', undefined, IP)).toMatchObject({ status: 401 })
    verifyTotp.mockReturnValueOnce(true)
    expect((await service.verifyMfaLogin(mfaToken, '123456', undefined, IP)).data).toHaveProperty('token')

    expect(actions().map((a) => [a.action, a.details?.reason ?? a.details?.method])).toEqual([
      ['auth.login.mfa_challenge', undefined],
      ['auth.login.failure', 'bad_mfa_code'],
      ['auth.login.success', 'password+totp'],
    ])
  })
})

describe('credential-change audit and security notices', () => {
  it('audits MFA enable and disable and tells the user (exempt security category)', async () => {
    repo.findById.mockResolvedValue(makeUser({ mfaSecret: 'PENDING' }))
    verifyTotp.mockReturnValue(true)
    expect(await service.mfaEnable('user-1', '123456', IP)).toMatchObject({ message: 'Two-factor authentication enabled' })
    repo.findById.mockResolvedValue(makeUser({ mfaEnabled: true, mfaSecret: 'SECRET' }))
    expect(await service.mfaDisable('user-1', '123456', IP)).toMatchObject({ message: 'Two-factor authentication disabled' })

    expect(actions().map((a) => a.action)).toEqual(['auth.mfa.enable', 'auth.mfa.disable'])
    expect(actions().every((a) => a.ipAddress === IP && a.userId === 'user-1')).toBe(true)
    expect(notify.mock.calls.map(([o]) => (o as { category: string }).category)).toEqual(['security', 'security'])
  })

  it('audits password change (success and failure) and notifies on success', async () => {
    repo.findById.mockResolvedValue(makeUser())
    compare.mockResolvedValueOnce(false)
    expect(await service.changePassword('user-1', 'wrong', 'N3w!Password', IP)).toMatchObject({ status: 401 })
    compare.mockResolvedValueOnce(true)
    expect(await service.changePassword('user-1', 'right', 'N3w!Password', IP)).toMatchObject({ message: 'Password changed successfully' })
    expect(actions().map((a) => a.action)).toEqual(['auth.password.change_failed', 'auth.password.change'])
    expect(notify).toHaveBeenCalledOnce()
    expect(notify.mock.calls[0][0]).toMatchObject({ userId: 'user-1', category: 'security' })
  })

  it('audits a completed password reset and the reset request', async () => {
    repo.findByEmail.mockResolvedValue(makeUser())
    await service.forgotPassword('ama@example.com', IP)
    const token = jwt.sign({ userId: 'user-1', purpose: 'reset' }, config.jwtSecret, { expiresIn: 3600 })
    repo.findById.mockResolvedValue(makeUser())
    expect(await service.resetPassword(token, 'N3w!Password', IP)).toMatchObject({ message: 'Password reset successfully' })
    expect(actions().map((a) => a.action)).toEqual(['auth.password.reset_requested', 'auth.password.reset'])
    expect(notify.mock.calls[0][0]).toMatchObject({ category: 'security' })
  })
})

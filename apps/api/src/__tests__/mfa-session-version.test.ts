import { beforeEach, expect, it, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import { AuthService } from '../services/authService.js'
import { config } from '../config/index.js'
import { RefreshToken } from '../models/RefreshToken.js'
import { verifyTotp } from '../utils/totp.js'

vi.mock('../services/notify.js', () => ({ notifyWelcome: vi.fn() }))
vi.mock('../utils/audit.js', () => ({ recordAuditEntry: vi.fn().mockResolvedValue(undefined) }))
vi.mock('bcryptjs', () => ({ default: { compare: vi.fn().mockResolvedValue(true) } }))
vi.mock('../utils/totp.js', () => ({ verifyTotp: vi.fn().mockReturnValue(true) }))
vi.mock('../models/RefreshToken.js', async importActual => ({
  ...await importActual<typeof import('../models/RefreshToken.js')>(),
  RefreshToken: { create: vi.fn().mockResolvedValue({}) },
}))
const user = {
  _id: 'fixture', email: 'fixture@example.test', passwordHash: 'fixture',
  roles: ['tenant'], activeRole: 'tenant', permissions: [],
  mfaEnabled: true, mfaSecret: 'fixture', sessionVersion: 3,
  toSafe: () => ({ id: 'fixture' }),
}
const repo = { findById: vi.fn(), findByEmail: vi.fn() }
const service = new AuthService(repo as never, {} as never, { info: vi.fn(), warn: vi.fn() } as never)
beforeEach(() => {
  vi.clearAllMocks()
  repo.findById.mockResolvedValue({ ...user })
  repo.findByEmail.mockResolvedValue({ ...user })
})
function challenge(sessionVersion: unknown) {
  return jwt.sign({ userId: user._id, purpose: 'mfa', sessionVersion }, config.jwtSecret, { expiresIn: 300 })
}
it.each([undefined, 0, 2, 4, '3', -1, 3.5, null])('rejects stale or invalid challenge version %s before TOTP or token issuance', async version => {
  expect(await service.verifyMfaLogin(challenge(version), '123456')).toMatchObject({ status: 401 })
  expect(verifyTotp).not.toHaveBeenCalled()
  expect(RefreshToken.create).not.toHaveBeenCalled()
})
it('accepts the current challenge and carries its version into the access token', async () => {
  const result = await service.verifyMfaLogin(challenge(3), '123456')
  expect(jwt.decode(result.data!.token)).toMatchObject({ purpose: 'session', sessionVersion: 3 })
  expect(RefreshToken.create).toHaveBeenCalledOnce()
})
it('accepts a legacy challenge only for a never-revoked account', async () => {
  repo.findById.mockResolvedValue({ ...user, sessionVersion: undefined })
  const result = await service.verifyMfaLogin(challenge(undefined), '123456')
  expect(jwt.decode(result.data!.token)).toMatchObject({ sessionVersion: 0 })
})
it('password login binds the MFA challenge to the account generation it authenticated', async () => {
  const result = await service.login(user.email, 'fixture')
  expect(jwt.decode(result.data!.mfaToken!)).toMatchObject({ purpose: 'mfa', sessionVersion: 3 })
})

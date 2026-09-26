import { describe, it, expect, vi, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'
import { AuthService } from '../services/authService.js'
import { ROLE_DEFAULT_PERMISSIONS, TERMS_VERSION, PRIVACY_VERSION } from '../types/index.js'

vi.mock('../models/User.js', () => ({
  User: { updateOne: vi.fn().mockResolvedValue({}) },
}))
vi.mock('../models/SubscriptionPackage.js', () => ({
  SubscriptionPackage: { findOne: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) },
}))
vi.mock('../models/RefreshToken.js', async (importActual) => {
  const actual = await importActual<typeof import('../models/RefreshToken.js')>()
  return { ...actual, RefreshToken: { create: vi.fn().mockResolvedValue({}) } }
})
vi.mock('../utils/audit.js', () => ({ recordAuditEntry: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../services/notify.js', () => ({
  notifyWelcome: vi.fn().mockResolvedValue(undefined),
  notify: vi.fn().mockResolvedValue(undefined),
}))

function makeService() {
  const userRepo = {
    findByEmail: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async (doc: { permissions?: string[] }) => ({
      _id: { toString: () => 'user-1' },
      permissions: doc.permissions ?? [],
      toSafe: () => ({ id: 'user-1' }),
    })),
  }
  const walletRepo = { create: vi.fn().mockResolvedValue({}) }
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { svc: new AuthService(userRepo as never, walletRepo as never, logger as never), userRepo }
}

const consent = { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, ageConfirmed: true, acceptedAt: new Date() }
const registerData = { email: 'ama@example.com', phone: '0240000000', password: 'password123', firstName: 'Ama', lastName: 'Owusu' }

describe('AuthService.register — role default permissions', () => {
  beforeEach(() => vi.clearAllMocks())

  // Employer and financier routes are permission-gated: with no permissions a
  // self-registered account got 403 on every core call.
  it.each(['employer', 'financier'] as const)('gives a new %s its role defaults, in the account and the token', async (role) => {
    const { svc, userRepo } = makeService()
    const result = await svc.register({ ...registerData, role }, undefined, undefined, consent)

    expect(result.status).toBe(201)
    const expected = ROLE_DEFAULT_PERMISSIONS[role]!
    expect(expected.length).toBeGreaterThan(0)
    expect(userRepo.create).toHaveBeenCalledWith(expect.objectContaining({ permissions: expected }))
    const token = (result.data as { token: string }).token
    expect((jwt.decode(token) as { permissions: string[] }).permissions).toEqual(expected)
  })

  it.each(['tenant', 'landlord', 'service_provider'])('gives a new %s no permissions', async (role) => {
    const { svc, userRepo } = makeService()
    const result = await svc.register({ ...registerData, role }, undefined, undefined, consent)

    expect(userRepo.create).toHaveBeenCalledWith(expect.objectContaining({ permissions: [] }))
    expect((jwt.decode((result.data as { token: string }).token) as { permissions: string[] }).permissions).toEqual([])
  })
})

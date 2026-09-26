import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthService } from '../services/authService.js'
import { User } from '../models/User.js'
import { SubscriptionPackage } from '../models/SubscriptionPackage.js'
import { TERMS_VERSION, PRIVACY_VERSION } from '../types/index.js'

vi.mock('../models/User.js', () => ({
  User: { updateOne: vi.fn().mockResolvedValue({}) },
}))
vi.mock('../models/SubscriptionPackage.js', () => ({
  SubscriptionPackage: { findOne: vi.fn() },
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

const createdUser = {
  _id: { toString: () => 'user-1' },
  permissions: [],
  toSafe: () => ({ id: 'user-1', email: 'kwame@example.com' }),
}

function makeService() {
  const userRepo = {
    findByEmail: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(createdUser),
  }
  const walletRepo = { create: vi.fn().mockResolvedValue({}) }
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  const svc = new AuthService(userRepo as never, walletRepo as never, logger as never)
  return { svc, userRepo, walletRepo, logger }
}

const consent = { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, ageConfirmed: true, acceptedAt: new Date() }

const registerData = {
  email: 'kwame@example.com',
  phone: '0240000000',
  password: 'password123',
  firstName: 'Kwame',
  lastName: 'Mensah',
}

describe('AuthService.register — default subscription package', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(SubscriptionPackage.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: { toString: () => 'pkg-default' }, name: 'Starter' }),
    } as never)
  })

  it('assigns the isDefault package to a new landlord', async () => {
    const { svc } = makeService()
    const result = await svc.register({ ...registerData, role: 'landlord' }, undefined, undefined, consent)

    expect(result.status).toBe(201)
    expect(vi.mocked(SubscriptionPackage.findOne)).toHaveBeenCalledWith({ isDefault: true, isActive: true })
    expect(vi.mocked(User.updateOne)).toHaveBeenCalledWith(
      { _id: createdUser._id },
      { $set: expect.objectContaining({ subscriptionPackageId: 'pkg-default' }) },
    )
  })

  it('assigns the isDefault package to a new property_manager', async () => {
    const { svc } = makeService()
    await svc.register({ ...registerData, role: 'property_manager' }, undefined, undefined, consent)
    expect(vi.mocked(User.updateOne)).toHaveBeenCalledOnce()
  })

  it('does not assign a package to a tenant', async () => {
    const { svc } = makeService()
    const result = await svc.register({ ...registerData, role: 'tenant' }, undefined, undefined, consent)

    expect(result.status).toBe(201)
    expect(vi.mocked(SubscriptionPackage.findOne)).not.toHaveBeenCalled()
    expect(vi.mocked(User.updateOne)).not.toHaveBeenCalled()
  })

  it('still registers successfully when no default package exists', async () => {
    vi.mocked(SubscriptionPackage.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as never)
    const { svc } = makeService()
    const result = await svc.register({ ...registerData, role: 'landlord' }, undefined, undefined, consent)

    expect(result.status).toBe(201)
    expect(vi.mocked(User.updateOne)).not.toHaveBeenCalled()
  })
})

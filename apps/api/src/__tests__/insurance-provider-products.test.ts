import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { config } from '../config/index.js'
import { InsuranceProviderProfile } from '../models/InsuranceProviderProfile.js'
import { InsuranceProduct } from '../models/InsuranceProduct.js'
import { recordAudit } from '../utils/audit.js'

vi.mock('../models/InsuranceProviderProfile.js', () => ({
  InsuranceProviderProfile: { findOne: vi.fn() },
}))
vi.mock('../models/InsuranceProduct.js', () => ({
  InsuranceProduct: { find: vi.fn(), create: vi.fn(), findOneAndUpdate: vi.fn() },
}))
vi.mock('../utils/audit.js', () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}))

// Imported AFTER mocks are registered (vitest hoists vi.mock anyway).
const { default: insuranceProvidersRouter } = await import('../routes/insuranceProviders.js')

const PROVIDER_USER = 'provider-user-1'

function signToken(roles: string[], userId = PROVIDER_USER): string {
  return jwt.sign(
    { userId, email: 'insurer@example.com', roles, permissions: [], purpose: 'session' },
    config.jwtSecret,
  )
}

const APPROVED_PROFILE = {
  _id: { toString: () => 'prov-1' },
  userId: PROVIDER_USER,
  institutionName: 'Acme Insurance',
  approvalStatus: 'approved',
}

/**
 * findOne serves both the approval gate (findOne().select().lean()) and the
 * route's own profile load (findOne().lean()), so mock both chain shapes.
 */
function mockProfile(profile: unknown) {
  const lean = vi.fn().mockResolvedValue(profile)
  const select = vi.fn().mockReturnValue({ lean })
  vi.mocked(InsuranceProviderProfile.findOne).mockReturnValue({ select, lean } as never)
}

function mockProductDoc(overrides: Record<string, unknown> = {}) {
  const doc = {
    _id: { toString: () => 'prod-1' },
    providerId: 'prov-1',
    providerName: 'Acme Insurance',
    productName: 'Rent Shield',
    ...overrides,
  }
  return { ...doc, toObject: () => doc }
}

const VALID_PRODUCT = {
  productName: 'Rent Shield',
  category: 'renters',
  description: 'Covers tenant default',
  coverageDetails: 'Up to 12 months rent',
  monthlyPremium: 25,
  coverageLimit: 12000,
}

describe('insurance provider products API', () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use('/api/insurance/providers', insuranceProvidersRouter)
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve())
    })
    const { port } = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${port}/api/insurance/providers`
  })

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('403s product creation while the provider profile is pending', async () => {
    mockProfile({ ...APPROVED_PROFILE, approvalStatus: 'pending' })
    const res = await fetch(`${baseUrl}/me/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signToken(['business'])}` },
      body: JSON.stringify(VALID_PRODUCT),
    })
    expect(res.status).toBe(403)
    expect(vi.mocked(InsuranceProduct.create)).not.toHaveBeenCalled()
  })

  it('creates a product with providerId/providerName forced from the profile, ignoring commissionPct', async () => {
    mockProfile(APPROVED_PROFILE)
    vi.mocked(InsuranceProduct.create).mockResolvedValue(mockProductDoc() as never)

    const res = await fetch(`${baseUrl}/me/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signToken(['business'])}` },
      body: JSON.stringify({ ...VALID_PRODUCT, providerId: 'spoofed', providerName: 'Spoofed Ltd', commissionPct: 15 }),
    })
    expect(res.status).toBe(201)
    const createArg = vi.mocked(InsuranceProduct.create).mock.calls[0][0] as Record<string, unknown>
    expect(createArg.providerId).toBe('prov-1')
    expect(createArg.providerName).toBe('Acme Insurance')
    expect(createArg).not.toHaveProperty('commissionPct')
    expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(
      expect.anything(), 'insurance.provider_product.create', 'InsuranceProduct', 'prod-1',
    )
  })

  it('lists only the provider’s own products', async () => {
    mockProfile(APPROVED_PROFILE)
    const lean = vi.fn().mockResolvedValue([mockProductDoc()])
    const sort = vi.fn().mockReturnValue({ lean })
    vi.mocked(InsuranceProduct.find).mockReturnValue({ sort } as never)

    const res = await fetch(`${baseUrl}/me/products`, {
      headers: { Authorization: `Bearer ${signToken(['business'])}` },
    })
    expect(res.status).toBe(200)
    expect(vi.mocked(InsuranceProduct.find)).toHaveBeenCalledWith({ providerId: 'prov-1' })
  })

  it('404s when patching a product owned by another provider', async () => {
    mockProfile(APPROVED_PROFILE)
    vi.mocked(InsuranceProduct.findOneAndUpdate).mockResolvedValue(null as never)

    const res = await fetch(`${baseUrl}/me/products/65f1a2b3c4d5e6f7a8b9c0d1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signToken(['business'])}` },
      body: JSON.stringify({ monthlyPremium: 30 }),
    })
    expect(res.status).toBe(404)
    const [query] = vi.mocked(InsuranceProduct.findOneAndUpdate).mock.calls[0] as unknown as [Record<string, unknown>]
    expect(query.providerId).toBe('prov-1')
  })
})

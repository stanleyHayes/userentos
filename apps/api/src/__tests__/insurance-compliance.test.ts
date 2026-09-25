import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { InsuranceProduct } from '../models/InsuranceProduct.js'
import { InsuranceProviderProfile } from '../models/InsuranceProviderProfile.js'
import { bootstrapInsurance } from '../bootstrapInsurance.js'
import { remainingCoverage } from '../services/insuranceClaims.js'

vi.mock('../models/InsuranceProduct.js', () => ({ InsuranceProduct: { countDocuments: vi.fn().mockResolvedValue(0), insertMany: vi.fn().mockResolvedValue([]) } }))

describe('insurance seeding', () => {
  const env = { ...process.env }
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { process.env = { ...env } })

  it('seeds nothing in production without an explicit opt-in', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.INSURANCE_DEMO_SEED
    await bootstrapInsurance()
    expect(vi.mocked(InsuranceProduct.insertMany)).not.toHaveBeenCalled()
  })

  it('seeds only clearly fictional, demo-flagged insurers outside production', async () => {
    process.env.NODE_ENV = 'development'
    await bootstrapInsurance()
    const seeded = vi.mocked(InsuranceProduct.insertMany).mock.calls[0][0] as unknown as { providerName: string; isDemo: boolean }[]
    expect(seeded.length).toBeGreaterThan(0)
    for (const p of seeded) {
      expect(p.isDemo).toBe(true)
      expect(p.providerName).toMatch(/fictional/i)
      expect(p.providerName).not.toMatch(/SIC|Enterprise|GLICO|Hollard|Star Assurance/i)
    }
  })

  it('the production seed no longer plants insurance products', () => {
    const source = readFileSync(new URL('../seedProduction.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/bootstrapInsurance/)
  })
})

describe('insurer licence verification', () => {
  const base = { userId: 'u1', institutionName: 'Acme Assurance', contactEmail: 'a@example.com', contactPhone: '0300000000' }

  it('cannot approve a provider without a licence number', async () => {
    const doc = new InsuranceProviderProfile({ ...base, approvalStatus: 'approved', approvedBy: 'admin-1', approvedAt: new Date() })
    await expect(doc.validate()).rejects.toThrow(/licence number/i)
  })

  it('approval records who verified the licence, and re-queueing clears it', async () => {
    const doc = new InsuranceProviderProfile({ ...base, licenseNumber: 'NIC-1', approvalStatus: 'approved', approvedBy: 'admin-1', approvedAt: new Date() })
    await doc.validate()
    expect(doc.licenseVerifiedBy).toBe('admin-1')
    expect(doc.licenseVerifiedAt).toBeInstanceOf(Date)
    doc.approvalStatus = 'pending'
    await doc.validate()
    expect(doc.licenseVerifiedAt).toBeUndefined()
  })
})

describe('claim cover', () => {
  it('counts approved and paid payouts against the limit, not pending or rejected claims', () => {
    const claims = [
      { id: 'a', status: 'paid', payoutAmount: 300, amount: 400 },
      { id: 'b', status: 'approved', payoutAmount: 100, amount: 100 },
      { id: 'c', status: 'rejected', amount: 900 },
      { id: 'd', status: 'pending', amount: 900 },
    ] as never
    expect(remainingCoverage({ claims }, 1000)).toBe(600)
    expect(remainingCoverage({ claims }, 1000, 'a')).toBe(900)
  })
})

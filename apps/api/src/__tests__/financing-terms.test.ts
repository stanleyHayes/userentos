import { describe, it, expect } from 'vitest'
import { buildCreditQuote, computeApr } from '../services/financing.js'
import { maxAdvanceMonthsFor } from '../services/legal/agreementCompliance.js'
import { FinancierProfile } from '../models/FinancierProfile.js'

describe('credit disclosure', () => {
  it('APR equals the nominal rate without fees and rises above it with an up-front fee', () => {
    const plain = buildCreditQuote({ principal: 6000, annualInterestRate: 18, tenureMonths: 6 })
    expect(plain.apr).toBeCloseTo(18, 1)
    const withFee = buildCreditQuote({ principal: 6000, annualInterestRate: 18, tenureMonths: 6, processingFeePct: 2 })
    expect(withFee.processingFee).toBe(120)
    expect(withFee.netDisbursed).toBe(5880)
    expect(withFee.apr).toBeGreaterThan(18)
    expect(withFee.totalCostOfCredit).toBeCloseTo(withFee.totalRepayable - 5880, 2)
  })

  it('reports zero APR for interest- and fee-free credit', () => {
    expect(computeApr(600, [100, 100, 100, 100, 100, 100])).toBe(0)
  })
})

describe('Rent Act s.25 advance ceiling', () => {
  it('allows six months for a longer tenancy and one for a monthly one', () => {
    expect(maxAdvanceMonthsFor('2026-01-01', '2026-12-31')).toBe(6)
    expect(maxAdvanceMonthsFor('2026-01-01', '2026-01-31')).toBe(1)
    expect(maxAdvanceMonthsFor('not-a-date', '2026-12-31')).toBe(1)
  })
})

describe('financier licence verification', () => {
  const base = { userId: 'f1', institutionName: 'Acme Finance', contactEmail: 'f@example.com', contactPhone: '0300000000' }

  it('cannot approve a financier without a licence number', async () => {
    await expect(new FinancierProfile({ ...base, approvalStatus: 'approved', approvedBy: 'admin' }).validate()).rejects.toThrow(/licence number/i)
  })

  it('records the licence verification on approval', async () => {
    const doc = new FinancierProfile({ ...base, licenseNumber: 'BOG-1', approvalStatus: 'approved', approvedBy: 'admin-2', approvedAt: new Date() })
    await doc.validate()
    expect(doc.licenseVerifiedBy).toBe('admin-2')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Request, Response } from 'express'
import { checkAgreementCompliance } from '../services/legal/agreementCompliance.js'
import { Agreement } from '../models/Agreement.js'
import { agreementController } from '../controllers/agreementController.js'

const terms = { startDate: '2026-01-01', endDate: '2027-01-01', advanceMonths: 6, terms: [] }
const lease = () => new Agreement({ ...terms, propertyId: 'property', landlordId: 'owner', tenantId: 'tenant', rentAmount: 1000 })
afterEach(() => vi.restoreAllMocks())

describe('agreement compliance across creation and signing', () => {
  it('accepts the six-month boundary and cites enacted legislation above it', () => {
    expect(checkAgreementCompliance(terms)).toEqual([])
    expect(checkAgreementCompliance({ ...terms, advanceMonths: 7 })).toEqual([
      expect.objectContaining({ type: 'violation', law: 'Rent Act, 1963 (Act 220), Section 25' }),
    ])
  })
  it.each(['2026-02-30', 'not-a-date', '2025-12-31', '2026-01-01'])('blocks invalid/reversed dates: %s', endDate => {
    expect(checkAgreementCompliance({ ...terms, endDate })).toContainEqual(expect.objectContaining({ type: 'violation' }))
  })
  it('reviews special conditions as well as standard terms', () => {
    expect(checkAgreementCompliance({ ...terms, specialConditions: ['Tenant must waive rights'] }))
      .toContainEqual(expect.objectContaining({ type: 'warning', clause: 'Tenant must waive rights' }))
  })
  it('application-style model creation cannot supply empty flags to bypass checks', async () => {
    const doc = lease()
    doc.advanceMonths = 12
    doc.complianceFlags = []
    await doc.validate()
    expect(doc.complianceFlags.some(f => f.type === 'violation')).toBe(true)
  })
  it('rechecks a legacy unflagged agreement before accepting a signature', async () => {
    const doc = lease()
    doc.advanceMonths = 12
    doc.complianceFlags = []
    vi.spyOn(Agreement, 'findById').mockResolvedValue(doc)
    const save = vi.spyOn(doc, 'save')
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    await agreementController.sign({ body: { signatureName: 'Owner Name' }, params: { id: doc.id }, user: { userId: 'owner' } } as unknown as Request, res as unknown as Response)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(save).not.toHaveBeenCalled()
    expect(doc.landlordSignature).toBeUndefined()
  })
  it.each(['expired', 'terminated', 'disputed', 'active'])('cannot edit a %s agreement back to draft', async status => {
    const doc = lease()
    doc.status = status
    vi.spyOn(Agreement, 'findById').mockResolvedValue(doc)
    const save = vi.spyOn(doc, 'save')
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    await agreementController.update({ body: { rentAmount: 1 }, params: { id: doc.id }, user: { userId: 'owner' } } as unknown as Request, res as unknown as Response)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(save).not.toHaveBeenCalled()
  })
})


describe('monthly and shorter tenancy advances', () => {
  it.each([
    ['2026-01-01', '2026-01-15'],
    ['2026-01-01', '2026-02-01'],
    ['2026-01-31', '2026-02-28'],
    ['2028-01-31', '2028-02-29'],
    ['2026-12-31', '2027-01-31'],
  ])('enforces the one-month boundary for %s to %s', (startDate, endDate) => {
    expect(checkAgreementCompliance({ ...terms, startDate, endDate, advanceMonths: 1 })).toEqual([])
    expect(checkAgreementCompliance({ ...terms, startDate, endDate, advanceMonths: 2 })).toContainEqual(expect.objectContaining({ type: 'violation', law: 'Rent Act, 1963 (Act 220), Section 25(5)' }))
  })
  it('does not classify a longer dated term as monthly merely because February is short', () => {
    expect(checkAgreementCompliance({ ...terms, startDate: '2026-02-01', endDate: '2026-03-02', advanceMonths: 2 })).toEqual([])
  })
  it('populates model flags and prevents signing a legacy short agreement with two months advance', async () => {
    const doc = lease()
    doc.endDate = '2026-02-01'
    doc.advanceMonths = 2
    await doc.validate()
    expect(doc.complianceFlags).toContainEqual(expect.objectContaining({ type: 'violation', law: 'Rent Act, 1963 (Act 220), Section 25(5)' }))
    doc.complianceFlags = []
    vi.spyOn(Agreement, 'findById').mockResolvedValue(doc)
    const save = vi.spyOn(doc, 'save')
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    await agreementController.sign({ body: { signatureName: 'Owner Name' }, params: { id: doc.id }, user: { userId: 'owner' } } as unknown as Request, res as unknown as Response)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(save).not.toHaveBeenCalled()
    expect(doc.landlordSignature).toBeUndefined()
  })
})

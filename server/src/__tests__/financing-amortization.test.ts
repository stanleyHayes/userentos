import { describe, it, expect } from 'vitest'
import { buildAmortizationSchedule } from '../services/financing.js'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

describe('buildAmortizationSchedule', () => {
  describe('Case 1: 12-month, 18% APR, GHS 12,000 principal', () => {
    const result = buildAmortizationSchedule({
      principal: 12000,
      annualInterestRate: 18,
      tenureMonths: 12,
    })

    it('produces a monthly payment of approximately 1100.16', () => {
      expect(result.monthlyPayment).toBeGreaterThan(1100.16 - 0.1)
      expect(result.monthlyPayment).toBeLessThan(1100.16 + 0.1)
    })

    it('produces a total repayable of approximately 13201.95', () => {
      expect(result.totalRepayable).toBeGreaterThan(13201.95 - 0.1)
      expect(result.totalRepayable).toBeLessThan(13201.95 + 0.1)
    })

    it('produces a 12-row schedule', () => {
      expect(result.schedule).toHaveLength(12)
    })

    it('every row has principal + interest === amountDue (within 0.02)', () => {
      for (const row of result.schedule) {
        const sum = row.principal + row.interest
        expect(Math.abs(sum - row.amountDue)).toBeLessThanOrEqual(0.02)
      }
    })
  })

  describe('Case 2: 0% interest, 6-month, GHS 6000', () => {
    const result = buildAmortizationSchedule({
      principal: 6000,
      annualInterestRate: 0,
      tenureMonths: 6,
    })

    it('has 6 installments', () => {
      expect(result.schedule).toHaveLength(6)
    })

    it('every installment is exactly 1000', () => {
      for (const row of result.schedule) {
        expect(row.amountDue).toBe(1000)
      }
    })

    it('total repayable equals 6000', () => {
      expect(result.totalRepayable).toBe(6000)
    })

    it('every row has interest === 0', () => {
      for (const row of result.schedule) {
        expect(row.interest).toBe(0)
      }
    })
  })

  describe('Case 3: 1-month tenure, 24% APR, GHS 1000', () => {
    const result = buildAmortizationSchedule({
      principal: 1000,
      annualInterestRate: 24,
      tenureMonths: 1,
    })

    it('has a single installment', () => {
      expect(result.schedule).toHaveLength(1)
    })

    it('monthlyPayment equals principal + interest at the single-period rate', () => {
      // 24% APR / 12 months = 2% monthly rate
      // Single-period payment = principal * (1 + r) = 1000 * 1.02 = 1020
      expect(result.monthlyPayment).toBeCloseTo(1020, 2)
      const row = result.schedule[0]
      expect(row.amountDue).toBeCloseTo(1020, 2)
      expect(row.interest).toBeCloseTo(20, 2)
      expect(row.principal).toBeCloseTo(1000, 2)
    })

    it('all amounts are non-negative', () => {
      for (const row of result.schedule) {
        expect(row.amountDue).toBeGreaterThanOrEqual(0)
        expect(row.principal).toBeGreaterThanOrEqual(0)
        expect(row.interest).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('Case 4: rounding behaviour', () => {
    // A combination prone to rounding drift
    const result = buildAmortizationSchedule({
      principal: 10000,
      annualInterestRate: 17.5,
      tenureMonths: 24,
    })

    it('sum of principal columns equals the original principal (within 0.10)', () => {
      const sum = result.schedule.reduce((acc, row) => acc + row.principal, 0)
      expect(Math.abs(sum - 10000)).toBeLessThanOrEqual(0.1)
    })

    it('final installment absorbs any rounding remainder so principal sums exactly', () => {
      const rowsExceptLast = result.schedule.slice(0, -1)
      const sumExceptLast = rowsExceptLast.reduce((acc, row) => acc + row.principal, 0)
      const finalPrincipal = result.schedule[result.schedule.length - 1].principal
      // The final principal portion makes up any difference to the original principal
      expect(Math.abs(sumExceptLast + finalPrincipal - 10000)).toBeLessThanOrEqual(0.01)
    })
  })

  describe('Case 5: schedule.dueDate', () => {
    const startDate = new Date('2025-01-15T00:00:00.000Z')
    const result = buildAmortizationSchedule({
      principal: 5000,
      annualInterestRate: 12,
      tenureMonths: 6,
      startDate,
    })

    it('first dueDate is 1 month after startDate', () => {
      expect(result.schedule[0].dueDate).toBe('2025-02-15')
    })

    it('last dueDate is tenureMonths months after startDate', () => {
      expect(result.schedule[result.schedule.length - 1].dueDate).toBe('2025-07-15')
    })

    it('every dueDate is in YYYY-MM-DD ISO format', () => {
      for (const row of result.schedule) {
        expect(row.dueDate).toMatch(ISO_DATE_RE)
      }
    })
  })
})

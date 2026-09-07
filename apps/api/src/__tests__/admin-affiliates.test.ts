import { describe, it, expect } from 'vitest'
import {
  COMMISSION_STATUSES,
  canTransitionCommission,
  isTerminalCommissionStatus,
  nextApprovalStatus,
} from '../routes/adminAffiliates.js'

const TERMINAL = ['paid', 'rejected', 'reversed'] as const

describe('affiliate commission transitions (spec §11)', () => {
  it('walks a commission through review and into the payout queue', () => {
    expect(canTransitionCommission('pending', 'approved')).toBe(true)
    expect(canTransitionCommission('approved', 'payable')).toBe(true)
    expect(canTransitionCommission('payable', 'paid')).toBe(true)
  })

  it('lets an admin reject anything that has not settled', () => {
    expect(canTransitionCommission('pending', 'rejected')).toBe(true)
    expect(canTransitionCommission('approved', 'rejected')).toBe(true)
    expect(canTransitionCommission('payable', 'rejected')).toBe(true)
  })

  it('allows a refund reversal from every unpaid state', () => {
    expect(canTransitionCommission('pending', 'reversed')).toBe(true)
    expect(canTransitionCommission('approved', 'reversed')).toBe(true)
    expect(canTransitionCommission('payable', 'reversed')).toBe(true)
  })

  it('refuses to skip the review step', () => {
    expect(canTransitionCommission('pending', 'payable')).toBe(false)
    expect(canTransitionCommission('pending', 'paid')).toBe(false)
    expect(canTransitionCommission('approved', 'paid')).toBe(false)
  })

  it('refuses to move a commission backwards', () => {
    expect(canTransitionCommission('approved', 'pending')).toBe(false)
    expect(canTransitionCommission('payable', 'approved')).toBe(false)
  })

  it('refuses a no-op transition onto the same status', () => {
    for (const status of COMMISSION_STATUSES) {
      expect(canTransitionCommission(status, status)).toBe(false)
    }
  })

  it.each(TERMINAL)('freezes %s against any further change', (status) => {
    expect(isTerminalCommissionStatus(status)).toBe(true)
    for (const target of COMMISSION_STATUSES) {
      expect(canTransitionCommission(status, target)).toBe(false)
    }
  })

  it('treats an unknown status as immovable rather than permissive', () => {
    expect(canTransitionCommission('nonsense', 'paid')).toBe(false)
    expect(canTransitionCommission('pending', 'nonsense')).toBe(false)
    expect(isTerminalCommissionStatus('nonsense')).toBe(false)
  })

  it('does not treat a live status as terminal', () => {
    expect(isTerminalCommissionStatus('pending')).toBe(false)
    expect(isTerminalCommissionStatus('approved')).toBe(false)
    expect(isTerminalCommissionStatus('payable')).toBe(false)
  })
})

describe('approval advances one step at a time', () => {
  it('reviews first, then releases for payout', () => {
    expect(nextApprovalStatus('pending')).toBe('approved')
    expect(nextApprovalStatus('approved')).toBe('payable')
  })

  it('never pays out on an approve click', () => {
    expect(nextApprovalStatus('payable')).toBeNull()
  })

  it('has nothing to advance once a commission is settled', () => {
    for (const status of TERMINAL) expect(nextApprovalStatus(status)).toBeNull()
  })

  it('only ever advances along a legal edge', () => {
    for (const status of COMMISSION_STATUSES) {
      const next = nextApprovalStatus(status)
      if (next) expect(canTransitionCommission(status, next)).toBe(true)
    }
  })
})

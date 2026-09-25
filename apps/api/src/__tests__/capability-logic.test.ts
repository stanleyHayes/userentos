import { describe, expect, it } from 'vitest'
import { canCreateWorkflow, rowsToCsv, initialWorkflowStatus, ownerMaySetStatus } from '../services/capabilityLogic.js'

describe('role capability workflow authorization', () => {
  it('allows only the intended role to request provider payouts', () => {
    expect(canCreateWorkflow('provider_payout', ['service_provider'])).toBe(true)
    expect(canCreateWorkflow('provider_payout', ['tenant'])).toBe(false)
  })

  it('supports the dedicated developer role and delegated property roles', () => {
    expect(canCreateWorkflow('offplan_listing', ['developer'])).toBe(true)
    expect(canCreateWorkflow('offplan_listing', ['property_manager'])).toBe(true)
    expect(canCreateWorkflow('offplan_listing', ['tenant'])).toBe(false)
  })
})

describe('capability workflow moderation', () => {
  it('starts every off-plan listing in review, whatever status was requested', () => {
    expect(initialWorkflowStatus('offplan_listing', 'published')).toBe('pending_review')
    expect(initialWorkflowStatus('offplan_listing', 'active')).toBe('pending_review')
    expect(initialWorkflowStatus('business_order', 'requested')).toBe('requested')
  })

  it('keeps publishing an off-plan listing out of its author\'s hands', () => {
    expect(ownerMaySetStatus('offplan_listing', 'active')).toBe(false)
    expect(ownerMaySetStatus('offplan_listing', 'published')).toBe(false)
    expect(ownerMaySetStatus('offplan_listing', 'cancelled')).toBe(true)
    expect(ownerMaySetStatus('business_order', 'active')).toBe(true)
  })
})

describe('capability CSV export', () => {
  it('escapes commas and quotes without exposing object formatting', () => {
    expect(rowsToCsv([{ name: 'Ada, Ltd', note: 'A "quoted" value' }]))
      .toBe('name,note\n"Ada, Ltd","A ""quoted"" value"')
  })
})

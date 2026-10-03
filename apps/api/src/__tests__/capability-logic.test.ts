import { describe, expect, it } from 'vitest'
import { canCreateWorkflow, rowsToCsv, initialWorkflowStatus, ownerMaySetStatus, WORKFLOW_ROLES } from '../services/capabilityLogic.js'

describe('role capability workflow authorization', () => {
  it('allows only the intended role to buy a featured listing', () => {
    expect(canCreateWorkflow('business_subscription', ['business'])).toBe(true)
    expect(canCreateWorkflow('business_subscription', ['tenant'])).toBe(false)
  })

  it('offers no provider payout workflow: withdrawals go through /api/payouts', () => {
    // It debited the wallet into a record nothing ever paid out.
    expect(Object.keys(WORKFLOW_ROLES)).not.toContain('provider_payout')
  })

  it('keeps off-plan listings to the developer journey', () => {
    expect(canCreateWorkflow('offplan_listing', ['developer'])).toBe(true)
    // Agents and landlords list property through Property; developer tools stay out of their menus.
    for (const role of ['property_manager', 'landlord', 'tenant']) {
      expect(canCreateWorkflow('offplan_listing', [role])).toBe(false)
      expect(canCreateWorkflow('developer_profile', [role])).toBe(false)
    }
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

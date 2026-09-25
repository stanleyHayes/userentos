import type { CapabilityKind } from '../models/CapabilityRecord.js'

export const WORKFLOW_ROLES: Record<CapabilityKind, string[]> = {
  provider_payout: ['service_provider'],
  business_order: ['tenant', 'landlord', 'business'],
  business_campaign: ['business'],
  business_subscription: ['business'],
  housing_benefit: ['employer'],
  developer_profile: ['developer', 'property_manager', 'landlord', 'admin'],
  offplan_listing: ['developer', 'property_manager', 'landlord', 'admin'],
}

export function canCreateWorkflow(kind: CapabilityKind, roles: string[]) {
  return roles.some((role) => WORKFLOW_ROLES[kind].includes(role))
}

/**
 * What a featured business listing costs, and for how long. Server-owned: the
 * price used to be `data.amount` from the request, so a business could buy 30
 * days of top placement for GHS 0.01.
 */
export const BUSINESS_FEATURED_PRICE_GHS = 50
export const BUSINESS_FEATURED_DAYS = 30

/** Statuses under which an off-plan listing is shown on the public developments page. */
export const PUBLIC_OFFPLAN_STATUSES = ['active', 'published'] as const

/**
 * The status a new workflow starts in. The client's choice is kept only where
 * it carries no authority: an off-plan listing is public marketing copy and
 * waits for moderation however it was submitted.
 */
export function initialWorkflowStatus(kind: CapabilityKind, requested: string): string {
  if (kind === 'offplan_listing') return 'pending_review'
  return requested
}

/**
 * Whether an owner may move a workflow to `status`. Publishing an off-plan
 * listing is a moderation decision (POST /workflows/:id/review), not a field
 * its author can set.
 */
export function ownerMaySetStatus(kind: string, status: string): boolean {
  return !(kind === 'offplan_listing' && (PUBLIC_OFFPLAN_STATUSES as readonly string[]).includes(status))
}

export function rowsToCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return ''
  const keys = Object.keys(rows[0])
  const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
  return [keys.join(','), ...rows.map((row) => keys.map((key) => cell(row[key])).join(','))].join('\n')
}

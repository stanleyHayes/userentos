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

export function rowsToCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return ''
  const keys = Object.keys(rows[0])
  const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
  return [keys.join(','), ...rows.map((row) => keys.map((key) => cell(row[key])).join(','))].join('\n')
}

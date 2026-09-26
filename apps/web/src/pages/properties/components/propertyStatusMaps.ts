import type { PropertyStatus } from '@/types'

export const statusVariant: Record<PropertyStatus, 'success' | 'default' | 'danger' | 'warning'> = {
  available: 'success', occupied: 'default', under_dispute: 'danger', maintenance_required: 'warning',
}

// Every review status the API can set (services/propertyReview.ts), so none
// shows as a raw string.
export const listingStatusVariant: Record<string, 'default' | 'warning' | 'success' | 'danger'> = {
  draft: 'default', pending_review: 'warning', in_review: 'warning', changes_requested: 'warning',
  approved: 'success', published: 'success', rejected: 'danger', suspended: 'danger',
  archived: 'default', withdrawn: 'default',
}

export const listingStatusLabel: Record<string, string> = {
  draft: 'Draft', pending_review: 'Pending Review', in_review: 'In Review', changes_requested: 'Changes Requested',
  approved: 'Approved', published: 'Published', rejected: 'Rejected', suspended: 'Suspended',
  archived: 'Archived', withdrawn: 'Withdrawn',
}

/** Reason codes offered on rejection — the API requires one. */
export const REJECT_REASONS = [
  { value: 'incomplete_details', label: 'Incomplete details' },
  { value: 'poor_media', label: 'Photos unusable or missing' },
  { value: 'suspected_duplicate', label: 'Suspected duplicate listing' },
  { value: 'not_compliant', label: 'Breaches rental law or policy' },
  { value: 'suspected_fraud', label: 'Suspected fraud' },
  { value: 'other', label: 'Other (explain below)' },
]

import type { PropertyStatus } from '@/types'
import { LISTING_STATUSES, type ListingStatusTone } from '../../../../../../packages/shared/listingStatus'

export const statusVariant: Record<PropertyStatus, 'success' | 'default' | 'danger' | 'warning'> = {
  available: 'success', occupied: 'default', under_dispute: 'danger', maintenance_required: 'warning',
}

// Every review status the API can set, worded as on mobile (packages/shared/listingStatus.ts).
export const listingStatusVariant: Record<string, ListingStatusTone> =
  Object.fromEntries(Object.entries(LISTING_STATUSES).map(([status, meta]) => [status, meta.tone]))

export const listingStatusLabel: Record<string, string> =
  Object.fromEntries(Object.entries(LISTING_STATUSES).map(([status, meta]) => [status, meta.label]))

/** Reason codes offered on rejection — the API requires one. */
export const REJECT_REASONS = [
  { value: 'incomplete_details', label: 'Incomplete details' },
  { value: 'poor_media', label: 'Photos unusable or missing' },
  { value: 'suspected_duplicate', label: 'Suspected duplicate listing' },
  { value: 'not_compliant', label: 'Breaches rental law or policy' },
  { value: 'suspected_fraud', label: 'Suspected fraud' },
  { value: 'other', label: 'Other (explain below)' },
]

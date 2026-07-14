import type { PropertyStatus } from '@/types'

export const statusVariant: Record<PropertyStatus, 'success' | 'default' | 'danger' | 'warning'> = {
  available: 'success', occupied: 'default', under_dispute: 'danger', maintenance_required: 'warning',
}

export const listingStatusVariant: Record<string, 'default' | 'warning' | 'success' | 'danger'> = {
  draft: 'default', pending_review: 'warning', approved: 'success', rejected: 'danger',
}

export const listingStatusLabel: Record<string, string> = {
  draft: 'Draft', pending_review: 'Pending Review', approved: 'Approved', rejected: 'Rejected',
}

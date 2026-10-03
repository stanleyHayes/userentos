// A listing's place in RentOS review (apps/api/src/services/propertyReview.ts
// sets every one of these), worded the same on web and mobile so no status
// ever shows as a raw string.

export type ListingStatusTone = 'default' | 'warning' | 'success' | 'danger'

export const LISTING_STATUSES = {
  draft: { label: 'Draft', tone: 'default' },
  pending_review: { label: 'Pending Review', tone: 'warning' },
  in_review: { label: 'In Review', tone: 'warning' },
  changes_requested: { label: 'Changes Requested', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  published: { label: 'Published', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  suspended: { label: 'Suspended', tone: 'danger' },
  archived: { label: 'Archived', tone: 'default' },
  withdrawn: { label: 'Withdrawn', tone: 'default' },
} as const satisfies Record<string, { label: string; tone: ListingStatusTone }>

export type ListingStatus = keyof typeof LISTING_STATUSES

/** Unknown statuses read as drafts: never as live. */
export function listingStatusMeta(status: string | null | undefined): { label: string; tone: ListingStatusTone } {
  return LISTING_STATUSES[(status ?? 'draft') as ListingStatus] ?? { label: status ?? 'Draft', tone: 'default' }
}

/** Statuses the owner can send (back) to RentOS review: TRANSITIONS in apps/api/src/services/propertyReview.ts. */
export const SUBMITTABLE_STATUSES: readonly ListingStatus[] = ['draft', 'changes_requested', 'rejected']

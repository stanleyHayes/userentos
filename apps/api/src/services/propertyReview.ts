/**
 * Property review state machine (spec §5.2) and reviewer authority model (§5.4).
 *
 * Two rules drive the design:
 *
 *  - Authority is expressed as `property.review.*` permissions, never as a
 *    hard-coded institution name, so Rent Control or any other authority can be
 *    granted review rights later without touching this file.
 *  - A super admin is ALWAYS authorized and is never removed by a queue filter.
 *    The spec calls this out because the original queue/UI made review
 *    impossible for them.
 */

export type ReviewStatus =
  | 'draft'
  | 'pending_review'
  | 'in_review'
  | 'changes_requested'
  | 'approved'
  | 'rejected'
  | 'published'
  | 'suspended'
  | 'archived'
  | 'withdrawn'

/** Legacy alias: the codebase shipped `pending_review` for the spec's SUBMITTED. */
export const SUBMITTED: ReviewStatus = 'pending_review'

/** Allowed transitions, straight from the spec's state table. */
export const TRANSITIONS: Record<ReviewStatus, ReviewStatus[]> = {
  draft: ['pending_review'],
  pending_review: ['in_review', 'withdrawn', 'approved', 'rejected', 'changes_requested'],
  in_review: ['approved', 'rejected', 'changes_requested'],
  changes_requested: ['pending_review'],
  approved: ['published', 'suspended', 'archived'],
  rejected: ['pending_review'],
  published: ['suspended', 'archived'],
  suspended: ['published', 'archived'],
  archived: ['draft'],
  withdrawn: ['draft'],
}

export function canTransition(from: ReviewStatus, to: ReviewStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to)
}

/**
 * Statuses at which a listing is live to the public.
 *
 * Both count: 'approved' is the state moderation leaves a listing in, and
 * 'published' is where a landlord (or `unsuspend`) moves it afterwards —
 * TRANSITIONS allows approved -> published, and sponsorship serving already
 * treated the pair as live. The public registry accepted only 'approved', so
 * anything reaching 'published' silently disappeared from the public site, and
 * unsuspending a listing removed it rather than restoring it.
 */
export const PUBLICLY_VISIBLE_STATUSES: ReviewStatus[] = ['approved', 'published']

/** Statuses a moderator should see in the review queue. */
export const REVIEWABLE_STATUSES: ReviewStatus[] = ['pending_review', 'in_review']

export type ReviewPermission =
  | 'property.review.read'
  | 'property.review.approve'
  | 'property.review.reject'
  | 'property.review.request_changes'
  | 'property.review.assign'
  | 'property.review.override'

interface ReviewPrincipal {
  roles: string[]
  permissions: string[]
}

export function isSuperAdminPrincipal(user: ReviewPrincipal): boolean {
  return user.roles.includes('super_admin')
}

/**
 * Authority check for a moderation action.
 *
 * Super admin always passes — including `override`, which nobody else gets.
 * Platform staff and external authority reviewers pass only on an explicit
 * grant, either through the permission itself or a role that implies it.
 */
export function canReview(user: ReviewPrincipal, permission: ReviewPermission): boolean {
  if (isSuperAdminPrincipal(user)) return true
  if (permission === 'property.review.override') return false

  if (user.permissions.includes(permission)) return true

  // Roles that carry review authority by default. Kept here (not scattered
  // through routes) so granting a new authority is a one-line change.
  const impliedByRole: Record<string, ReviewPermission[]> = {
    admin: ['property.review.read', 'property.review.approve', 'property.review.reject', 'property.review.request_changes', 'property.review.assign'],
    government: ['property.review.read', 'property.review.approve', 'property.review.reject', 'property.review.request_changes'],
    legal_officer: ['property.review.read'],
  }
  return user.roles.some((role) => impliedByRole[role]?.includes(permission))
}

/** The permission a given action requires. */
export const ACTION_PERMISSION: Record<string, ReviewPermission> = {
  approve: 'property.review.approve',
  reject: 'property.review.reject',
  request_changes: 'property.review.request_changes',
  suspend: 'property.review.override',
  unsuspend: 'property.review.override',
  assign: 'property.review.assign',
}

/** Target status for each moderation action. */
export const ACTION_TARGET: Record<string, ReviewStatus> = {
  approve: 'approved',
  reject: 'rejected',
  request_changes: 'changes_requested',
  suspend: 'suspended',
  unsuspend: 'published',
}

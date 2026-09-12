/**
 * Property moderation — the review queue and the actions on it (spec §5).
 *
 * Split out of routes/properties.ts because moderation has a different
 * authority model to ordinary property CRUD: authority comes from
 * `property.review.*` permissions rather than from owning the record, and a
 * super admin must always be able to act.
 *
 * Every action writes an immutable PropertyReview row plus an audit event, so a
 * disputed approval can be reconstructed later.
 */
import { Router } from 'express'
import { z } from 'zod'
import type { Types } from 'mongoose'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { Property } from '../models/Property.js'
import { PropertyReview } from '../models/PropertyReview.js'
import { User } from '../models/User.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { recordAudit } from '../utils/audit.js'
import { notifyPropertyApproved, notifyPropertyRejected, notifyPropertyChangesRequested } from '../services/notify.js'
import { checkAndAward } from '../services/achievements.js'
import {
  canReview, canTransition, isSuperAdminPrincipal,
  ACTION_PERMISSION, ACTION_TARGET, REVIEWABLE_STATUSES,
  type ReviewStatus,
} from '../services/propertyReview.js'

const router = Router()

const reviewSchema = z.object({
  action: z.enum(['approve', 'reject', 'request_changes', 'suspend', 'unsuspend']),
  reasonCode: z.string().max(60).optional(),
  note: z.string().max(2000).optional(),
  issues: z.array(z.string().min(1).max(300)).max(20).default([]),
})

const queueQuerySchema = z.object({
  status: z.string().optional(),
  city: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

interface Principal { roles: string[]; permissions: string[] }
const principal = (req: { user?: { roles: string[]; permissions: string[] } }): Principal => ({
  roles: req.user?.roles ?? [],
  permissions: req.user?.permissions ?? [],
})

/**
 * The review queue.
 *
 * Deliberately filtered ONLY by listing status (plus optional city/status the
 * caller asks for). The spec's investigation checklist calls out reviewer_id /
 * agency_id / owner_id / organization scoping as the classic reason a super
 * admin sees an empty queue, and a regression test asserts none of those keys
 * appear in this filter.
 */
router.get('/review-queue', authenticate, asyncHandler(async (req, res) => {
  if (!canReview(principal(req), 'property.review.read')) {
    error(res, 'You do not have permission to review properties', 403)
    return
  }

  const parsed = queueQuerySchema.safeParse(req.query)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const { status, city, page, limit } = parsed.data

  const filter: Record<string, unknown> = status
    ? { listingStatus: status }
    : { listingStatus: { $in: REVIEWABLE_STATUSES } }
  if (city) filter['address.city'] = city

  const [items, total] = await Promise.all([
    Property.find(filter).sort({ createdAt: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    Property.countDocuments(filter),
  ])

  const mapped = (items as unknown as Record<string, unknown>[]).map((p) => ({
    ...p,
    id: (p._id as Types.ObjectId).toString(),
  }))

  success(res, { items: mapped, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) })
}))

/** Full moderation history for one property, newest first. */
router.get('/:id/reviews', authenticate, asyncHandler(async (req, res) => {
  const propertyId = param(req.params.id)
  const property = await Property.findById(propertyId).lean()
  if (!property) { error(res, 'Property not found', 404); return }

  const isOwner = (property as unknown as { landlordId?: string }).landlordId === req.user!.userId
  if (!isOwner && !canReview(principal(req), 'property.review.read')) {
    error(res, 'You do not have permission to view this history', 403)
    return
  }

  const reviews = await PropertyReview.find({ propertyId }).sort({ createdAt: -1 }).lean()
  const reviewerIds = [...new Set(reviews.map((r) => r.reviewerId))]
  const reviewers = await User.find({ _id: { $in: reviewerIds } }).select('firstName lastName').lean()
  const nameById = new Map(reviewers.map((u) => [String(u._id), `${u.firstName} ${u.lastName}`.trim()]))

  success(res, {
    items: reviews.map((r) => ({
      ...r,
      id: String(r._id),
      reviewerName: nameById.get(r.reviewerId) ?? 'Reviewer',
    })),
    total: reviews.length,
  })
}))

/**
 * Owner submits (or resubmits) for review.
 *
 * A resubmission bumps reviewVersion rather than clearing anything, so the
 * previous cycle's decisions stay queryable.
 */
router.post('/:id/submit', authenticate, asyncHandler(async (req, res) => {
  const property = await Property.findById(param(req.params.id))
  if (!property) { error(res, 'Property not found', 404); return }

  const isOwner = property.landlordId === req.user!.userId
  if (!isOwner && !isSuperAdminPrincipal(principal(req))) {
    error(res, 'Only the owner can submit this property for review', 403)
    return
  }

  const from = (property.listingStatus ?? 'draft') as ReviewStatus
  if (!canTransition(from, 'pending_review')) {
    error(res, `A property in "${from}" cannot be submitted for review`, 409)
    return
  }

  const isResubmission = from === 'changes_requested' || from === 'rejected'
  const reviewVersion = (property.reviewVersion ?? 1) + (isResubmission ? 1 : 0)

  property.listingStatus = 'pending_review'
  property.reviewVersion = reviewVersion
  property.submittedAt = new Date()
  await property.save()

  await PropertyReview.create({
    propertyId: property._id.toString(),
    reviewVersion,
    action: 'submit',
    reviewerId: req.user!.userId,
    reviewerOrg: 'owner',
    fromStatus: from,
    toStatus: 'pending_review',
  })
  await recordAudit(req, 'property.submitted', 'Property', property._id.toString(), { from, reviewVersion })

  success(res, { id: property._id.toString(), listingStatus: property.listingStatus, reviewVersion }, 'Submitted for review')
}))

/** Owner withdraws a pending submission. */
router.post('/:id/withdraw', authenticate, asyncHandler(async (req, res) => {
  const property = await Property.findById(param(req.params.id))
  if (!property) { error(res, 'Property not found', 404); return }
  if (property.landlordId !== req.user!.userId && !isSuperAdminPrincipal(principal(req))) {
    error(res, 'Only the owner can withdraw this submission', 403)
    return
  }

  const from = (property.listingStatus ?? 'draft') as ReviewStatus
  if (!canTransition(from, 'withdrawn')) {
    error(res, `A property in "${from}" cannot be withdrawn`, 409)
    return
  }

  property.listingStatus = 'withdrawn'
  await property.save()
  await PropertyReview.create({
    propertyId: property._id.toString(),
    reviewVersion: property.reviewVersion ?? 1,
    action: 'withdraw',
    reviewerId: req.user!.userId,
    reviewerOrg: 'owner',
    fromStatus: from,
    toStatus: 'withdrawn',
  })

  success(res, { id: property._id.toString(), listingStatus: 'withdrawn' }, 'Submission withdrawn')
}))

/**
 * The moderation decision itself: approve, reject, request changes, suspend or
 * unsuspend.
 *
 * This is the action the review UI had no way to call — the queue rendered a
 * button with no handler, so no decision could ever be recorded.
 */
router.post('/:id/review', authenticate, asyncHandler(async (req, res) => {
  const parsed = reviewSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const { action, reasonCode, note, issues } = parsed.data

  const me = principal(req)
  const permission = ACTION_PERMISSION[action]
  if (!canReview(me, permission)) {
    error(res, `You do not have permission to ${action.replace('_', ' ')} properties`, 403)
    return
  }

  // Policy: a rejection must carry a reason code and a human explanation, and
  // "request changes" must list what to fix. Without these the owner has no
  // route back to an approvable listing.
  if (action === 'reject' && !reasonCode) {
    error(res, 'A reason code is required when rejecting a property')
    return
  }
  if (action === 'request_changes' && issues.length === 0) {
    error(res, 'List at least one actionable issue when requesting changes')
    return
  }

  const property = await Property.findById(param(req.params.id))
  if (!property) { error(res, 'Property not found', 404); return }

  const from = (property.listingStatus ?? 'draft') as ReviewStatus
  const to = ACTION_TARGET[action]
  if (!canTransition(from, to)) {
    error(res, `A property in "${from}" cannot move to "${to}"`, 409)
    return
  }

  property.listingStatus = to
  property.reviewedBy = req.user!.userId
  property.reviewedAt = new Date()
  if (action === 'approve') {
    property.publishedAt = new Date()
    property.rejectionReason = undefined
  }
  if (action === 'reject' || action === 'request_changes') {
    property.rejectionReason = note || reasonCode || ''
  }
  property.reviewIssues = action === 'request_changes' ? issues : []
  await property.save()

  await PropertyReview.create({
    propertyId: property._id.toString(),
    reviewVersion: property.reviewVersion ?? 1,
    action,
    reviewerId: req.user!.userId,
    reviewerOrg: isSuperAdminPrincipal(me) ? 'rentos' : (req.user!.roles[0] ?? 'rentos'),
    reasonCode,
    note,
    issues,
    fromStatus: from,
    toStatus: to,
  })
  await recordAudit(req, `property.${action}`, 'Property', property._id.toString(), { from, to, reasonCode, issues })

  // Owner notifications are best-effort: a delivery failure must not roll back
  // a recorded moderation decision.
  try {
    if (action === 'approve') {
      await notifyPropertyApproved(property.landlordId, property.title)
      checkAndAward(property.landlordId, 'first_property_listed', { propertyId: property._id.toString() })
        .catch(() => undefined)
    } else if (action === 'reject') {
      await notifyPropertyRejected(property.landlordId, property.title, note || reasonCode)
    } else if (action === 'request_changes') {
      await notifyPropertyChangesRequested(property.landlordId, property.title, issues)
    }
  } catch {
    // logged by notify itself
  }

  success(res, {
    id: property._id.toString(),
    listingStatus: to,
    reviewVersion: property.reviewVersion ?? 1,
  }, `Property ${action.replace('_', ' ')}d`)
}))

export default router

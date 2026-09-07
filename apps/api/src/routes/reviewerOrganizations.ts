/**
 * Reviewer organizations — enabling optional external authorities (spec P8).
 *
 * Admin-only. Nothing here is required for the platform to operate: with no
 * active organization, `resolveReviewRouting` returns rentos_only and the
 * publishing state machine is untouched.
 */
import { Router } from 'express'
import { z } from 'zod'
import { authenticate, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { ReviewerOrganization } from '../models/ReviewerOrganization.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { recordAudit } from '../utils/audit.js'

const router = Router()
router.use(authenticate, requireRole('admin', 'super_admin'))

router.get('/', asyncHandler(async (_req, res) => {
  const items = await ReviewerOrganization.find().sort({ name: 1 }).lean()
  success(res, { items: items.map((o) => ({ ...o, id: String(o._id) })), total: items.length })
}))

const orgSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and hyphens'),
  kind: z.enum(['platform', 'government', 'partner']).default('partner'),
  reviewMode: z.enum(['advisory', 'required', 'delegated']).default('advisory'),
  isActive: z.boolean().default(false),
  scope: z.object({
    regions: z.array(z.string()).default([]),
    cities: z.array(z.string()).default([]),
  }).default({ regions: [], cities: [] }),
  permissions: z.array(z.string()).default(['property.review.read']),
})

router.post('/', asyncHandler(async (req, res) => {
  const parsed = orgSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  if (await ReviewerOrganization.findOne({ slug: parsed.data.slug }).lean()) {
    error(res, 'That slug is already used', 409)
    return
  }

  const org = await ReviewerOrganization.create(parsed.data)
  await recordAudit(req, 'reviewer_org.created', 'ReviewerOrganization', String(org._id), parsed.data)
  success(res, { ...org.toObject(), id: String(org._id) }, 'Reviewer organization created', 201)
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  const parsed = orgSchema.partial().safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const org = await ReviewerOrganization.findById(param(req.params.id))
  if (!org) { error(res, 'Organization not found', 404); return }

  const before = { isActive: org.isActive, reviewMode: org.reviewMode }
  Object.assign(org, parsed.data)
  await org.save()

  await recordAudit(req, 'reviewer_org.updated', 'ReviewerOrganization', String(org._id), { before, after: parsed.data })
  success(res, { ...org.toObject(), id: String(org._id) }, 'Reviewer organization updated')
}))

export default router

import { Router } from 'express'
import type { Types } from 'mongoose'
import type { Model } from 'mongoose'
import { z } from 'zod'
import { authenticate, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { Worker } from '../models/Worker.js'
import { Business } from '../models/Business.js'
import { FinancierProfile } from '../models/FinancierProfile.js'
import { InsuranceProviderProfile } from '../models/InsuranceProviderProfile.js'
import { User } from '../models/User.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { recordAudit } from '../utils/audit.js'
import { notify } from '../services/notify.js'
import { logger } from '../utils/logger.js'
import type { ApprovableEntityType } from '../middleware/entityApproval.js'

const router = Router()

// All routes in this file are admin-only.
router.use(authenticate, requireRole('admin', 'super_admin'))

interface ApprovalDoc {
  approvalStatus: string
  approvedBy?: string
  approvedAt?: Date
  rejectionReason?: string
}

const ENTITY_MODELS: Record<ApprovableEntityType, { model: Model<unknown>; ownerField: 'userId' | 'ownerId'; label: string; entityType: string }> = {
  worker: { model: Worker as unknown as Model<unknown>, ownerField: 'userId', label: 'Worker', entityType: 'Worker' },
  business: { model: Business as unknown as Model<unknown>, ownerField: 'ownerId', label: 'Business', entityType: 'Business' },
  financier: { model: FinancierProfile as unknown as Model<unknown>, ownerField: 'userId', label: 'Financier', entityType: 'FinancierProfile' },
  insurance_provider: { model: InsuranceProviderProfile as unknown as Model<unknown>, ownerField: 'userId', label: 'Insurance provider', entityType: 'InsuranceProviderProfile' },
}

const typeSchema = z.enum(['worker', 'business', 'financier', 'insurance_provider'])

const listQuerySchema = z.object({
  type: typeSchema,
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

/* ================================================================
   GET /api/admin/approvals — list entity profiles by approval status,
   with the owning user's contact info joined in.
   ================================================================ */
router.get('/', asyncHandler(async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const { type, status, page, limit } = parsed.data

  const { model, ownerField } = ENTITY_MODELS[type]
  const filter = { approvalStatus: status }
  const skip = (page - 1) * limit
  const [docs, total] = await Promise.all([
    model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean() as Promise<(Record<string, unknown> & { _id: Types.ObjectId })[]>,
    model.countDocuments(filter),
  ])

  const ownerIds = docs.map((d) => d[ownerField]).filter((v): v is string => typeof v === 'string')
  const users = ownerIds.length
    ? await User.find({ _id: { $in: ownerIds } }).select('firstName lastName email phone').lean()
    : []
  const userMap = new Map(users.map((u) => [u._id.toString(), u]))

  const items = docs.map((d) => ({
    ...d,
    id: d._id.toString(),
    user: userMap.get(String(d[ownerField])) ?? null,
  }))

  success(res, { items, total, page, limit })
}))

/* ================================================================
   POST /api/admin/approvals/:type/:id/approve
   Side effects: Worker → verificationLevel 'basic', Business → isVerified.
   ================================================================ */
router.post('/:type/:id/approve', asyncHandler(async (req, res) => {
  const typeParsed = typeSchema.safeParse(param(req.params.type))
  if (!typeParsed.success) { error(res, 'Invalid entity type'); return }
  const type = typeParsed.data
  const { model, ownerField, label, entityType } = ENTITY_MODELS[type]

  const doc = await model.findById(param(req.params.id)) as (ApprovalDoc & { _id: Types.ObjectId; save(): Promise<unknown>; toObject(): Record<string, unknown> } & Record<string, unknown>) | null
  if (!doc) { error(res, `${label} profile not found`, 404); return }
  if (doc.approvalStatus === 'approved') { error(res, 'Already approved', 409); return }

  doc.approvalStatus = 'approved'
  doc.approvedBy = req.user!.userId
  doc.approvedAt = new Date()
  doc.rejectionReason = undefined
  // Approving a worker grants the 'basic' verification floor — never downgrade
  // a profile that already holds a higher level (verified/premium).
  if (type === 'worker' && doc.verificationLevel === 'none') doc.verificationLevel = 'basic'
  if (type === 'business') doc.isVerified = true
  await doc.save()

  await recordAudit(req, `admin.${type}.approve`, entityType, doc._id.toString())

  const ownerId = doc[ownerField] as string | undefined
  if (ownerId) {
    notify({
      userId: ownerId,
      title: `${label} Approved`,
      message: `Your ${label.toLowerCase()} profile has been approved. You now have full access.`,
      actionUrl: '/dashboard',
    }).catch((err) => logger.warn('[adminApprovals] notify failed:', (err as Error).message))
  }

  success(res, { ...doc.toObject(), id: doc._id.toString() }, `${label} approved`)
}))

/* ================================================================
   POST /api/admin/approvals/:type/:id/reject — body { reason }
   ================================================================ */
const rejectSchema = z.object({
  reason: z.string().min(3, 'A rejection reason is required'),
})

router.post('/:type/:id/reject', asyncHandler(async (req, res) => {
  const typeParsed = typeSchema.safeParse(param(req.params.type))
  if (!typeParsed.success) { error(res, 'Invalid entity type'); return }
  const parsed = rejectSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const type = typeParsed.data
  const { model, ownerField, label, entityType } = ENTITY_MODELS[type]

  const doc = await model.findById(param(req.params.id)) as (ApprovalDoc & { _id: Types.ObjectId; save(): Promise<unknown>; toObject(): Record<string, unknown> } & Record<string, unknown>) | null
  if (!doc) { error(res, `${label} profile not found`, 404); return }
  if (doc.approvalStatus === 'rejected') { error(res, 'Already rejected', 409); return }

  doc.approvalStatus = 'rejected'
  doc.rejectionReason = parsed.data.reason
  doc.approvedBy = undefined
  doc.approvedAt = undefined
  await doc.save()

  await recordAudit(req, `admin.${type}.reject`, entityType, doc._id.toString(), { reason: parsed.data.reason })

  const ownerId = doc[ownerField] as string | undefined
  if (ownerId) {
    notify({
      userId: ownerId,
      title: `${label} Rejected`,
      message: `Your ${label.toLowerCase()} profile was rejected. Reason: ${parsed.data.reason}`,
      actionUrl: '/dashboard',
    }).catch((err) => logger.warn('[adminApprovals] notify failed:', (err as Error).message))
  }

  success(res, { ...doc.toObject(), id: doc._id.toString() }, `${label} rejected`)
}))

export default router

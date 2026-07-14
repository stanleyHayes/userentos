import { Router } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { authenticate, requireRole } from '../middleware/auth.js'
import { FeatureFlag } from '../models/FeatureFlag.js'
import { evaluateAllForContext, invalidateFlagCache } from '../services/featureFlags.js'
import { success, error } from '../utils/response.js'

const router = Router()

const roleEnum = z.enum(['tenant', 'landlord', 'property_manager', 'government', 'legal_officer', 'admin', 'super_admin', 'financier', 'employer'])

// GET /api/feature-flags/me — evaluated map for current user
router.get('/me', authenticate, async (req, res) => {
  const map = await evaluateAllForContext({
    userId: req.user!.userId,
    role: req.user!.roles[0],
  })
  success(res, map)
})

// GET /api/feature-flags — list all (super_admin)
router.get('/', authenticate, requireRole('super_admin'), async (_req, res) => {
  const flags = await FeatureFlag.find().sort({ key: 1 }).lean()
  const items = flags.map((f) => ({ ...f, id: (f._id as Types.ObjectId).toString() }))
  success(res, { items, total: items.length })
})

// POST /api/feature-flags — create flag (super_admin)
router.post('/', authenticate, requireRole('super_admin'), async (req, res) => {
  const schema = z.object({
    key: z.string().min(1).max(100),
    description: z.string().optional(),
    enabled: z.boolean().optional(),
    rolloutPct: z.number().min(0).max(100).optional(),
    enabledForUserIds: z.array(z.string()).optional(),
    enabledForRoles: z.array(roleEnum).optional(),
    disabledForUserIds: z.array(z.string()).optional(),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  try {
    const existing = await FeatureFlag.findOne({ key: parsed.data.key.toLowerCase() })
    if (existing) { error(res, 'A flag with this key already exists', 409); return }

    const flag = await FeatureFlag.create({ ...parsed.data, key: parsed.data.key.toLowerCase() })
    invalidateFlagCache()
    success(res, { ...flag.toObject(), id: flag._id.toString() }, 'Flag created', 201)
  } catch (e) {
    const err = e as { message?: string }
    error(res, err.message || 'Failed to create flag')
  }
})

// PATCH /api/feature-flags/:key — update flag (super_admin)
router.patch('/:key', authenticate, requireRole('super_admin'), async (req, res) => {
  const schema = z.object({
    description: z.string().optional(),
    enabled: z.boolean().optional(),
    rolloutPct: z.number().min(0).max(100).optional(),
    enabledForUserIds: z.array(z.string()).optional(),
    enabledForRoles: z.array(z.string()).optional(),
    disabledForUserIds: z.array(z.string()).optional(),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const keyParam = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key
  const flag = await FeatureFlag.findOneAndUpdate(
    { key: (keyParam ?? '').toLowerCase() },
    { $set: parsed.data },
    { returnDocument: 'after' },
  )

  if (!flag) { error(res, 'Flag not found', 404); return }

  invalidateFlagCache()
  success(res, { ...flag.toObject(), id: flag._id.toString() }, 'Flag updated')
})

export default router

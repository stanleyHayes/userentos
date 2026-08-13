import { Router } from 'express'
import { z } from 'zod'
import { authenticate, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { FinancierProfile } from '../models/FinancierProfile.js'
import { success, error } from '../utils/response.js'

const router = Router()

const idOf = <T extends { _id: { toString(): string } }>(doc: T) => ({ ...doc, id: doc._id.toString() })

// Get own financier org profile (null when not yet created)
router.get('/me', authenticate, requireRole('financier'), asyncHandler(async (req, res) => {
  const profile = await FinancierProfile.findOne({ userId: req.user!.userId }).lean()
  success(res, { profile: profile ? idOf(profile) : null })
}))

const upsertSchema = z.object({
  institutionName: z.string().min(2),
  licenseNumber: z.string().optional(),
  contactEmail: z.string().email(),
  contactPhone: z.string().min(7),
  address: z.string().optional(),
})

// Create or update own financier org profile. New profiles land as 'pending'
// and unlock financier capabilities once an admin approves them. Editing an
// approved profile re-queues it for review.
router.post('/me', authenticate, requireRole('financier'), asyncHandler(async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const existing = await FinancierProfile.findOne({ userId: req.user!.userId })
  if (existing) {
    Object.assign(existing, parsed.data)
    if (existing.approvalStatus === 'approved') {
      existing.approvalStatus = 'pending'
      existing.approvedBy = undefined
      existing.approvedAt = undefined
    }
    await existing.save()
    success(res, { profile: idOf(existing.toObject()) }, 'Profile updated')
    return
  }
  const profile = await FinancierProfile.create({ ...parsed.data, userId: req.user!.userId })
  success(res, { profile: idOf(profile.toObject()) }, 'Financier profile created — pending admin approval', 201)
}))

export default router

import { Router } from 'express'
import type { Types } from 'mongoose'
import { authenticate } from '../middleware/auth.js'
import { TenantProfile, calcScore } from '../models/TenantProfile.js'
import { ProfileAccess } from '../models/ProfileAccess.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'

const router = Router()

// Recalculate score if stale (0 but profile has data)
async function ensureScore<T extends object>(profile: T): Promise<T> {
  const score = calcScore(profile)
  const raw = profile as Record<string, unknown> & { _id: unknown; completionScore?: number; profileComplete?: boolean }
  if (score !== raw.completionScore) {
    await TenantProfile.updateOne(
      { _id: raw._id as string },
      { completionScore: score, profileComplete: score >= 100 }
    )
    raw.completionScore = score
    raw.profileComplete = score >= 100
  }
  return profile
}

// Get my profile
router.get('/me', authenticate, async (req, res) => {
  let profile = await TenantProfile.findOne({ userId: req.user!.userId }).lean()
  if (!profile) {
    const created = await TenantProfile.create({ userId: req.user!.userId })
    profile = created.toObject()
  }
  const scored = await ensureScore(profile)
  success(res, { ...scored, id: (scored._id as Types.ObjectId).toString() })
})

// Update my profile
router.patch('/me', authenticate, async (req, res) => {
  const profile = await TenantProfile.findOne({ userId: req.user!.userId })
  if (!profile) { error(res, 'Profile not found', 404); return }

  // Accept all profile fields except system fields
  const blocked = ['_id', 'userId', 'completionScore', 'profileComplete', 'lastUpdated', 'idVerified', 'incomeVerified', 'addressVerified', '__v']

  for (const [key, value] of Object.entries(req.body)) {
    if (!blocked.includes(key) && value !== undefined) {
      ;(profile as unknown as Record<string, unknown>)[key] = value
    }
  }

  await profile.save() // pre-save hook calculates score

  success(res, { ...profile.toObject(), id: profile._id.toString() })
})

// Landlord/Gov: view tenant profile by userId (requires approved access)
router.get('/:userId', authenticate, async (req, res) => {
  const roles = req.user!.roles
  if (!roles.includes('landlord') && !roles.includes('property_manager') && !roles.includes('government') && !roles.includes('admin') && !roles.includes('super_admin')) {
    error(res, 'Not authorized', 403); return
  }

  const targetUserId = param(req.params.userId)

  // Check if requester has approved access to this tenant's profile
  const access = await ProfileAccess.findOne({
    requesterId: req.user!.userId,
    tenantId: targetUserId,
    status: 'approved',
  })

  if (!access) {
    error(res, 'Access not granted. Please request permission to view this tenant\'s profile.', 403); return
  }

  const profile = await TenantProfile.findOne({ userId: targetUserId }).lean()
  if (!profile) { error(res, 'Profile not found', 404); return }
  const scored = await ensureScore(profile)
  success(res, { ...scored, id: (scored._id as Types.ObjectId).toString() })
})

export default router

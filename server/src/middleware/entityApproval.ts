import type { Request, Response, NextFunction } from 'express'
import type { Model } from 'mongoose'
import { Worker } from '../models/Worker.js'
import { Business } from '../models/Business.js'
import { FinancierProfile } from '../models/FinancierProfile.js'
import { InsuranceProviderProfile } from '../models/InsuranceProviderProfile.js'
import { error } from '../utils/response.js'

export type ApprovableEntityType = 'worker' | 'business' | 'financier' | 'insurance_provider'

interface EntityConfig {
  model: Model<unknown>
  /** Field on the profile doc that holds the owning user's id. */
  ownerField: 'userId' | 'ownerId'
  label: string
}

const ENTITY_CONFIG: Record<ApprovableEntityType, EntityConfig> = {
  worker: { model: Worker as unknown as Model<unknown>, ownerField: 'userId', label: 'worker' },
  business: { model: Business as unknown as Model<unknown>, ownerField: 'ownerId', label: 'business' },
  financier: { model: FinancierProfile as unknown as Model<unknown>, ownerField: 'userId', label: 'financier' },
  insurance_provider: { model: InsuranceProviderProfile as unknown as Model<unknown>, ownerField: 'userId', label: 'insurance provider' },
}

/**
 * KYC gate: blocks entity capabilities (creating offers, listings, etc.) until
 * an admin has approved the caller's entity profile. Login and base-app usage
 * are unaffected. admin / super_admin bypass the gate.
 */
export function requireApprovedEntity(type: ApprovableEntityType) {
  const { model, ownerField, label } = ENTITY_CONFIG[type]
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        error(res, 'Authentication required', 401)
        return
      }
      if (req.user.roles.includes('admin') || req.user.roles.includes('super_admin')) {
        next()
        return
      }
      const profile = await model.findOne({ [ownerField]: req.user.userId })
        .select('approvalStatus rejectionReason')
        .lean() as { approvalStatus?: string; rejectionReason?: string } | null
      if (!profile) {
        error(res, `Create your ${label} profile before using this feature`, 404)
        return
      }
      if (profile.approvalStatus === 'approved') {
        next()
        return
      }
      if (profile.approvalStatus === 'rejected') {
        error(res, `Your ${label} profile was rejected.${profile.rejectionReason ? ` Reason: ${profile.rejectionReason}` : ''} Update your profile and await re-review.`, 403)
        return
      }
      error(res, `Your ${label} profile is pending admin approval. You'll be notified once it's reviewed.`, 403)
    } catch (err) {
      next(err)
    }
  }
}

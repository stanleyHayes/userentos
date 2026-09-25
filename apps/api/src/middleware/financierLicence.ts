import type { Request, Response, NextFunction } from 'express'
import { verifiedFinancierIds } from '../models/FinancierProfile.js'
import { error } from '../utils/response.js'

/**
 * Lending actions need more than an approved profile: the licence itself must
 * have been verified. Profiles approved before licences were required pass
 * requireApprovedEntity but not this. admin / super_admin are exempt.
 */
export async function requireVerifiedFinancierLicence(req: Request, res: Response, next: NextFunction) {
  try {
    const roles = req.user?.roles ?? []
    if (roles.includes('admin') || roles.includes('super_admin')) { next(); return }
    if (!(await verifiedFinancierIds()).has(req.user!.userId)) {
      error(res, 'Your lending licence must be recorded and verified by an admin before you can do this', 403)
      return
    }
    next()
  } catch (err) {
    next(err)
  }
}

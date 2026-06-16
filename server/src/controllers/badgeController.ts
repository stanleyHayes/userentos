import { Request, Response } from 'express'
import { Application } from '../models/Application.js'
import { Agreement } from '../models/Agreement.js'
import { Dispute } from '../models/Dispute.js'
import { Payment } from '../models/Payment.js'
import { ProfileAccess } from '../models/ProfileAccess.js'
import { success } from '../utils/response.js'

export interface BadgeCounts {
  applications: number
  agreements: number
  disputes: number
  payments: number
  profileAccess: number
}

export const badgeController = {
  counts: async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const roles = req.user!.roles ?? []

    const isLandlord = roles.includes('landlord') || roles.includes('property_manager')
    const isTenant = roles.includes('tenant')
    const isAdmin = roles.includes('admin') || roles.includes('super_admin')
    const isGovernment = roles.includes('government') || roles.includes('legal_officer')

    // Run all count queries in parallel
    const [applications, agreements, disputes, payments, profileAccess] = await Promise.all([
      // Applications needing attention
      isLandlord || isAdmin
        ? Application.countDocuments({ landlordId: userId, status: 'pending' })
        : isTenant
          ? Application.countDocuments({ tenantId: userId, status: { $in: ['approved', 'rejected'] }, respondedAt: { $exists: true } })
          : Promise.resolve(0),

      // Agreements awaiting signature
      Agreement.countDocuments({
        $or: [
          { landlordId: userId, status: 'pending_signatures', landlordSignature: { $exists: false } },
          { tenantId: userId, status: 'pending_signatures', tenantSignature: { $exists: false } },
        ],
      }),

      // Active disputes needing attention
      isGovernment || isAdmin
        ? Dispute.countDocuments({ status: { $in: ['filed', 'under_mediation', 'escalated'] } })
        : Dispute.countDocuments({
            $or: [{ filedBy: userId }, { filedAgainst: userId }],
            status: { $in: ['filed', 'under_mediation', 'escalated'] },
          }),

      // Pending/overdue payments
      isTenant
        ? Payment.countDocuments({ tenantId: userId, status: 'pending' })
        : isLandlord
          ? Payment.countDocuments({ landlordId: userId, status: 'pending' })
          : isAdmin
            ? Payment.countDocuments({ status: 'pending' })
            : Promise.resolve(0),

      // Pending profile access requests (for tenants: requests to approve; for landlords: awaiting response)
      isTenant
        ? ProfileAccess.countDocuments({ tenantId: userId, status: 'pending' })
        : isLandlord
          ? ProfileAccess.countDocuments({ requesterId: userId, status: 'pending' })
          : Promise.resolve(0),
    ])

    success(res, { applications, agreements, disputes, payments, profileAccess } as BadgeCounts)
  },
}

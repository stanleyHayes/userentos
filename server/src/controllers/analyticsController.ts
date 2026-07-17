import { Request, Response } from 'express'
import { User } from '../models/User.js'
import { Property } from '../models/Property.js'
import { Agreement } from '../models/Agreement.js'
import { Payment } from '../models/Payment.js'
import { SavingsPlan } from '../models/SavingsPlan.js'
import { Wallet } from '../models/Wallet.js'
import { Dispute } from '../models/Dispute.js'
import { Application } from '../models/Application.js'
import { Review } from '../models/Review.js'
import { CreditScore } from '../models/CreditScore.js'
import { Investment } from '../models/Investment.js'
import { Loan } from '../models/Loan.js'
import { TenantProfile } from '../models/TenantProfile.js'
import { Notification } from '../models/Notification.js'
import { Conversation, Message } from '../models/Conversation.js'
import { Favorite } from '../models/Favorite.js'
import { Invitation } from '../models/Invitation.js'
import { DocumentModel } from '../models/Document.js'
import { AuditLog } from '../models/AuditLog.js'
import { success } from '../utils/response.js'
import { logger } from '../utils/logger.js'
import { cache } from '../services/cache.js'

function parseDateRange(req: Request): { start: Date; end: Date } {
  const rawStart = req.query.startDate as string | undefined
  const rawEnd = req.query.endDate as string | undefined
  const end = rawEnd ? new Date(rawEnd) : new Date()
  const start = rawStart
    ? new Date(rawStart)
    : new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid date format. Use ISO 8601 (YYYY-MM-DD).')
  }
  return { start: start as Date, end: end as Date }
}

function dateFilter(start: Date, end: Date, field = 'createdAt'): Record<string, unknown> {
  return { [field]: { $gte: start.toISOString(), $lte: end.toISOString() } }
}

export const analyticsController = {
  me: async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const roles = req.user!.roles
    const { start, end } = parseDateRange(req)

    if (roles.includes('landlord') || roles.includes('property_manager')) {
      const [properties, agreements, payments, disputes, allPayments, applications, reviews] = await Promise.all([
        Property.find({ landlordId: userId }).lean(),
        Agreement.find({ landlordId: userId, ...dateFilter(start, end, 'startDate') }).lean(),
        Payment.find({ landlordId: userId, status: 'completed', ...dateFilter(start, end, 'paidAt') }).lean(),
        Dispute.find({ $or: [{ filedBy: userId }, { filedAgainst: userId }], ...dateFilter(start, end) }).lean(),
        Payment.find({ landlordId: userId, ...dateFilter(start, end, 'paidAt') }).lean(),
        Application.find({ landlordId: userId, ...dateFilter(start, end) }).lean(),
        Review.find({ landlordId: userId, ...dateFilter(start, end) }).lean(),
      ])

      const monthlyIncome: Record<string, number> = {}
      for (const p of payments) {
        const month = (p.paidAt ?? (p as { createdAt?: Date }).createdAt?.toISOString?.() ?? '').slice(0, 7)
        if (month) monthlyIncome[month] = (monthlyIncome[month] ?? 0) + p.amount
      }

      const activeAgreements = agreements.filter((a) => a.status === 'active')
      const pendingPayments = allPayments.filter((p) => p.status === 'pending')
      const overduePayments = allPayments.filter((p) => p.status === 'overdue')

      const occupiedCount = properties.filter((p) => p.status === 'occupied').length
      const occupancyRate = properties.length > 0 ? Math.round((occupiedCount / properties.length) * 100) : 0
      const maintenanceCount = properties.filter((p) => p.status === 'maintenance_required').length

      const now = new Date()
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const lastDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastMonth = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}`
      const thisMonthRevenue = monthlyIncome[thisMonth] ?? 0
      const lastMonthRevenue = monthlyIncome[lastMonth] ?? 0
      const revenueChange = lastMonthRevenue > 0
        ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
        : thisMonthRevenue > 0 ? 100 : 0

      const sixtyDaysOut = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString()
      const expiringLeases = activeAgreements.filter(
        (a) => a.endDate <= sixtyDaysOut && a.endDate >= now.toISOString()
      ).length

      const propertyTypes: Record<string, number> = {}
      for (const p of properties) {
        propertyTypes[p.type] = (propertyTypes[p.type] ?? 0) + 1
      }

      // Applications breakdown
      const applicationsByStatus: Record<string, number> = {}
      for (const app of applications) {
        applicationsByStatus[app.status] = (applicationsByStatus[app.status] ?? 0) + 1
      }

      // Reviews stats
      const avgRating = reviews.length > 0 ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10 : 0
      const avgRentAmount = properties.length > 0 ? Math.round(properties.reduce((s, p) => s + p.rentAmount, 0) / properties.length) : 0

      // New tenants this month
      const newTenantsThisMonth = activeAgreements.filter((a) => a.startDate?.slice(0, 7) === thisMonth).length

      // Disputes breakdown
      const disputesByStatus: Record<string, number> = {}
      for (const d of disputes) {
        disputesByStatus[d.status] = (disputesByStatus[d.status] ?? 0) + 1
      }

      success(res, {
        period: { start: start.toISOString(), end: end.toISOString() },
        totalProperties: properties.length,
        occupiedProperties: occupiedCount,
        availableProperties: properties.filter((p) => p.status === 'available').length,
        maintenanceProperties: maintenanceCount,
        occupancyRate,
        activeAgreements: activeAgreements.length,
        totalAgreements: agreements.length,
        activeTenants: new Set(activeAgreements.map((a) => a.tenantId)).size,
        totalRevenue: payments.reduce((s, p) => s + p.amount, 0),
        thisMonthRevenue,
        lastMonthRevenue,
        revenueChange,
        monthlyIncome,
        pendingPayments: pendingPayments.length,
        pendingAmount: pendingPayments.reduce((s, p) => s + p.amount, 0),
        overduePayments: overduePayments.length,
        overdueAmount: overduePayments.reduce((s, p) => s + p.amount, 0),
        openDisputes: disputes.filter((d) => d.status !== 'closed' && d.status !== 'resolved').length,
        totalDisputes: disputes.length,
        disputesByStatus,
        collectionRate: agreements.length > 0 ? Math.round((payments.length / Math.max(agreements.length * 6, 1)) * 100) : 0,
        expiringLeases,
        propertyTypes,
        avgRentAmount,
        newTenantsThisMonth,
        // Applications
        totalApplications: applications.length,
        applicationsByStatus,
        pendingApplications: applicationsByStatus.pending ?? 0,
        // Reviews
        totalReviews: reviews.length,
        avgRating,
      })
    } else {
      const [agreements, payments, plans, wallet, allPayments, disputes, applications] = await Promise.all([
        Agreement.find({ tenantId: userId, ...dateFilter(start, end, 'startDate') }).lean(),
        Payment.find({ tenantId: userId, status: 'completed', ...dateFilter(start, end, 'paidAt') }).lean(),
        SavingsPlan.find({ userId, ...dateFilter(start, end) }).lean(),
        Wallet.findOne({ userId }).lean(),
        Payment.find({ tenantId: userId, ...dateFilter(start, end, 'paidAt') }).lean(),
        Dispute.find({ filedBy: userId, ...dateFilter(start, end) }).lean(),
        Application.find({ tenantId: userId, ...dateFilter(start, end) }).lean(),
      ])

      const totalSaved = plans.reduce((s, p) => s + p.currentAmount, 0)
      const savingsTarget = plans.reduce((s, p) => s + p.targetAmount, 0)

      // Monthly payment history
      const monthlyPayments: Record<string, number> = {}
      for (const p of payments) {
        const month = (p.paidAt ?? (p as { createdAt?: Date }).createdAt?.toISOString?.() ?? '').slice(0, 7)
        if (month) monthlyPayments[month] = (monthlyPayments[month] ?? 0) + p.amount
      }

      // Pending/overdue payments
      const pendingPayments = allPayments.filter((p) => p.status === 'pending')
      const overduePayments = allPayments.filter((p) => p.status === 'overdue')

      // Disputes
      const openDisputes = disputes.filter((d) => d.status !== 'closed' && d.status !== 'resolved')

      // Applications
      const applicationsByStatus: Record<string, number> = {}
      for (const app of applications) {
        applicationsByStatus[app.status] = (applicationsByStatus[app.status] ?? 0) + 1
      }

      const activeAgreement = agreements.find((a) => a.status === 'active')

      success(res, {
        period: { start: start.toISOString(), end: end.toISOString() },
        activeAgreements: agreements.filter((a) => a.status === 'active').length,
        totalAgreements: agreements.length,
        totalPaid: payments.reduce((s, p) => s + p.amount, 0),
        paymentCount: payments.length,
        nextPaymentAmount: activeAgreement?.rentAmount ?? 0,
        walletBalance: wallet?.balance ?? 0,
        totalSaved,
        savingsTarget,
        activePlans: plans.filter((p) => p.status === 'active').length,
        savingsProgress: savingsTarget > 0 ? Math.round((totalSaved / savingsTarget) * 100) : 0,
        monthlyPayments,
        // Pending/overdue
        pendingPayments: pendingPayments.length,
        pendingAmount: pendingPayments.reduce((s, p) => s + p.amount, 0),
        overduePayments: overduePayments.length,
        overdueAmount: overduePayments.reduce((s, p) => s + p.amount, 0),
        // Disputes
        openDisputes: openDisputes.length,
        totalDisputes: disputes.length,
        // Applications
        totalApplications: applications.length,
        applicationsByStatus,
        pendingApplications: applicationsByStatus.pending ?? 0,
      })
    }
  },

  platform: async (_req: Request, res: Response) => {
    const cacheKey = 'analytics:platform'
    const cached = await cache.get(cacheKey)
    if (cached) {
      success(res, cached)
      return
    }

    // Use MongoDB aggregation pipelines instead of loading entire collections into memory
    const [
      usersAgg,
      propertiesAgg,
      agreementsAgg,
      paymentsAgg,
      disputesAgg,
      plansAgg,
      applicationsAgg,
      reviewsAgg,
      creditScoresAgg,
      investmentsAgg,
      loansAgg,
      tenantProfilesAgg,
      walletsAgg,
      notificationsAgg,
      conversationsAgg,
      messagesAgg,
      favoritesAgg,
      invitationsAgg,
      documentsAgg,
      auditLogsAgg,
    ] = await Promise.all([
      // Users
      User.aggregate<{ _id: string[]; count: number }>([{ $group: { _id: '$roles', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      // Properties — $facet grouped counts; $push-ing whole collections into one
      // result doc hits the 16MB BSON cap at modest volume.
      Property.aggregate([
        { $facet: {
          totals: [{ $group: {
            _id: null,
            total: { $sum: 1 },
            furnished: { $sum: { $cond: ['$furnished', 1, 0] } },
            totalViews: { $sum: '$views' },
            totalInquiries: { $sum: '$inquiries' },
            totalFavorites: { $sum: '$favorites' },
            avgRent: { $avg: '$rentAmount' },
          } }],
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          byListingStatus: [{ $group: { _id: '$listingStatus', count: { $sum: 1 } } }],
          byType: [{ $group: { _id: '$type', count: { $sum: 1 } } }],
          byStayType: [{ $group: { _id: '$stayType', count: { $sum: 1 } } }],
          regions: [{ $group: { _id: '$address.region', count: { $sum: 1 } } }],
          cities: [{ $group: { _id: '$address.city', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }],
          rentByType: [{ $group: { _id: '$type', avgRent: { $avg: '$rentAmount' } } }],
        }},
      ]),
      // Agreements
      Agreement.aggregate([
        { $facet: {
          totals: [{ $group: { _id: null, total: { $sum: 1 } } }],
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          byRenewal: [{ $group: { _id: { $ifNull: ['$renewalStatus', 'none'] }, count: { $sum: 1 } } }],
          compliance: [{ $unwind: '$complianceFlags' }, { $group: { _id: '$complianceFlags.type', count: { $sum: 1 } } }],
        }},
      ]),
      // Payments
      Payment.aggregate([
        { $facet: {
          totals: [{ $group: {
            _id: null,
            total: { $sum: 1 },
            completedVolume: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$amount', 0] } },
            completedCount: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          } }],
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          byMethod: [{ $group: { _id: '$method', count: { $sum: 1 } } }],
          monthly: [{ $match: { status: 'completed' } }, { $group: { _id: { $substr: ['$paidAt', 0, 7] }, volume: { $sum: '$amount' } } }],
        }},
      ]),
      // Disputes
      Dispute.aggregate([
        { $facet: {
          totals: [{ $group: {
            _id: null,
            total: { $sum: 1 },
            open: { $sum: { $cond: [{ $and: [{ $ne: ['$status', 'closed'] }, { $ne: ['$status', 'resolved'] }] }, 1, 0] } },
          } }],
          byCategory: [{ $group: { _id: '$category', count: { $sum: 1 } } }],
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        }},
      ]),
      // Savings Plans
      SavingsPlan.aggregate([
        { $facet: {
          totals: [{ $group: { _id: null, total: { $sum: 1 }, totalSaved: { $sum: '$currentAmount' }, totalTargeted: { $sum: '$targetAmount' } } }],
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          activeSavers: [{ $match: { status: 'active' } }, { $group: { _id: '$userId' } }, { $count: 'n' }],
        }},
      ]),
      // Applications
      Application.aggregate([
        { $facet: {
          totals: [{ $group: { _id: null, total: { $sum: 1 } } }],
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        }},
      ]),
      // Reviews
      Review.aggregate([
        { $group: {
          _id: null,
          total: { $sum: 1 },
          avgRating: { $avg: '$rating' },
          verified: { $sum: { $cond: ['$verified', 1, 0] } },
          avgLandlordResponsive: { $avg: '$landlordResponsive' },
          avgMaintenance: { $avg: '$maintenance' },
          avgValueForMoney: { $avg: '$valueForMoney' },
          avgNeighborhood: { $avg: '$neighborhood' },
          wouldRecommend: { $sum: { $cond: ['$wouldRecommend', 1, 0] } },
        }},
      ]),
      // Credit Scores
      CreditScore.aggregate([
        { $group: {
          _id: null,
          total: { $sum: 1 },
          avgScore: { $avg: '$score' },
          excellent: { $sum: { $cond: [{ $gte: ['$score', 80] }, 1, 0] } },
          good: { $sum: { $cond: [{ $and: [{ $gte: ['$score', 60] }, { $lt: ['$score', 80] }] }, 1, 0] } },
          fair: { $sum: { $cond: [{ $and: [{ $gte: ['$score', 40] }, { $lt: ['$score', 60] }] }, 1, 0] } },
          poor: { $sum: { $cond: [{ $lt: ['$score', 40] }, 1, 0] } },
        }},
      ]),
      // Investments
      Investment.aggregate([
        { $facet: {
          totals: [{ $group: { _id: null, total: { $sum: 1 }, totalInvested: { $sum: '$amount' }, totalExpectedReturn: { $sum: '$expectedReturn' } } }],
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          byType: [{ $group: { _id: '$type', count: { $sum: 1 } } }],
        }},
      ]),
      // Loans
      Loan.aggregate([
        { $facet: {
          totals: [{ $group: {
            _id: null,
            total: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            totalRepaid: { $sum: '$amountPaid' },
            totalOutstanding: { $sum: { $cond: [{ $in: ['$status', ['active', 'approved']] }, { $subtract: ['$totalRepayment', '$amountPaid'] }, 0] } },
          } }],
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        }},
      ]),
      // Tenant Profiles
      TenantProfile.aggregate([
        { $group: {
          _id: null,
          total: { $sum: 1 },
          avgCompletionScore: { $avg: '$completionScore' },
          complete: { $sum: { $cond: ['$profileComplete', 1, 0] } },
          idVerified: { $sum: { $cond: ['$idVerified', 1, 0] } },
          incomeVerified: { $sum: { $cond: ['$incomeVerified', 1, 0] } },
        }},
      ]),
      // Wallets
      Wallet.aggregate([
        { $group: {
          _id: null,
          total: { $sum: 1 },
          totalBalance: { $sum: '$balance' },
          totalTransactions: { $sum: { $size: { $ifNull: ['$transactions', []] } } },
        }},
      ]),
      // Notifications
      Notification.aggregate([
        { $facet: {
          totals: [{ $group: { _id: null, total: { $sum: 1 }, unread: { $sum: { $cond: ['$read', 0, 1] } } } }],
          byChannel: [{ $group: { _id: '$channel', count: { $sum: 1 } } }],
        }},
      ]),
      // Conversations
      Conversation.countDocuments(),
      // Messages
      Message.aggregate([
        { $group: {
          _id: null,
          total: { $sum: 1 },
          unread: { $sum: { $cond: ['$read', 0, 1] } },
        }},
      ]),
      // Favorites
      Favorite.countDocuments(),
      // Invitations
      Invitation.aggregate([
        { $facet: {
          totals: [{ $group: { _id: null, total: { $sum: 1 } } }],
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        }},
      ]),
      // Documents
      DocumentModel.aggregate([
        { $facet: {
          totals: [{ $group: { _id: null, total: { $sum: 1 }, totalFileSize: { $sum: { $ifNull: ['$fileSize', 0] } } } }],
          byType: [{ $group: { _id: '$type', count: { $sum: 1 } } }],
        }},
      ]),
      // Audit Logs
      AuditLog.aggregate([
        { $facet: {
          totals: [{ $group: { _id: null, total: { $sum: 1 } } }],
          byAction: [{ $group: { _id: '$action', count: { $sum: 1 } } }],
          byEntity: [{ $group: { _id: '$entityType', count: { $sum: 1 } } }],
        }},
      ]),
    ]).catch((err) => {
      logger.error('[Analytics] Platform aggregation failed:', err)
      throw err
    })

    // Turn grouped facet results [{_id, count}] into a count map
    function groupedToCounts(arr: { _id: string | null; count: number }[] | undefined): Record<string, number> {
      const counts: Record<string, number> = {}
      for (const g of arr ?? []) {
        if (g._id == null) continue
        counts[g._id] = (counts[g._id] ?? 0) + g.count
      }
      return counts
    }

    const pF = propertiesAgg[0] ?? {}
    const pAgg = pF.totals?.[0] ?? {}
    const aF = agreementsAgg[0] ?? {}
    const aAgg = aF.totals?.[0] ?? {}
    const payF = paymentsAgg[0] ?? {}
    const payAgg = payF.totals?.[0] ?? {}
    const dF = disputesAgg[0] ?? {}
    const dAgg = dF.totals?.[0] ?? {}
    const appF = applicationsAgg[0] ?? {}
    const appAgg = appF.totals?.[0] ?? {}
    const rAgg = reviewsAgg[0] ?? {}
    const cAgg = creditScoresAgg[0] ?? {}
    const iF = investmentsAgg[0] ?? {}
    const iAgg = iF.totals?.[0] ?? {}
    const lF = loansAgg[0] ?? {}
    const lAgg = lF.totals?.[0] ?? {}
    const tAgg = tenantProfilesAgg[0] ?? {}
    const wAgg = walletsAgg[0] ?? {}
    const nF = notificationsAgg[0] ?? {}
    const nAgg = nF.totals?.[0] ?? {}
    const mAgg = messagesAgg[0] ?? {}
    const invF = invitationsAgg[0] ?? {}
    const invAgg = invF.totals?.[0] ?? {}
    const docF = documentsAgg[0] ?? {}
    const docAgg = docF.totals?.[0] ?? {}
    const audF = auditLogsAgg[0] ?? {}
    const audAgg = audF.totals?.[0] ?? {}
    const sF = plansAgg[0] ?? {}
    const sAgg = sF.totals?.[0] ?? {}

    // Compute monthly volume from completed payments
    const monthlyVolume: Record<string, number> = {}
    for (const m of payF.monthly ?? []) {
      if (m._id) monthlyVolume[m._id] = Math.round(m.volume * 100) / 100
    }

    // Top cities — already sorted/limited by the pipeline
    const topCities = (pF.cities ?? []).filter((c: { _id?: string }) => c._id).map((c: { _id: string; count: number }) => ({ city: c._id, count: c.count }))

    // Avg rent by type — computed in-pipeline (no full-collection scan)
    const avgRentByType: Record<string, number> = {}
    for (const r of pF.rentByType ?? []) {
      if (r._id) avgRentByType[r._id] = Math.round(r.avgRent ?? 0)
    }

    const usersByRole: Record<string, number> = {}
    for (const u of usersAgg) {
      for (const role of u._id ?? []) {
        usersByRole[role] = (usersByRole[role] ?? 0) + (u.count ?? 0)
      }
    }

    const result = {
      // ── USERS ──
      users: {
        total: usersAgg.reduce((s, u) => s + (u.count ?? 0), 0),
        byRole: usersByRole,
      },

      // ── PROPERTIES ──
      properties: {
        total: pAgg.total ?? 0,
        byStatus: groupedToCounts(pF.byStatus),
        byListingStatus: groupedToCounts(pF.byListingStatus),
        byType: groupedToCounts(pF.byType),
        byStayType: groupedToCounts(pF.byStayType),
        furnished: pAgg.furnished ?? 0,
        unfurnished: (pAgg.total ?? 0) - (pAgg.furnished ?? 0),
        avgRent: pAgg.avgRent ? Math.round(pAgg.avgRent) : 0,
        avgRentByType,
        regions: groupedToCounts(pF.regions),
        topCities,
        engagement: { views: pAgg.totalViews ?? 0, inquiries: pAgg.totalInquiries ?? 0, favorites: pAgg.totalFavorites ?? 0 },
      },

      // ── AGREEMENTS ──
      agreements: {
        total: aAgg.total ?? 0,
        byStatus: groupedToCounts(aF.byStatus),
        byRenewalStatus: groupedToCounts(aF.byRenewal),
        compliance: {
          violations: groupedToCounts(aF.compliance).violation ?? 0,
          warnings: groupedToCounts(aF.compliance).warning ?? 0,
        },
      },

      // ── PAYMENTS ──
      payments: {
        total: payAgg.total ?? 0,
        completedVolume: payAgg.completedVolume ?? 0,
        byStatus: groupedToCounts(payF.byStatus),
        byMethod: groupedToCounts(payF.byMethod),
        monthlyVolume,
        avgPaymentAmount: payAgg.completedCount > 0
          ? Math.round(payAgg.completedVolume / payAgg.completedCount)
          : 0,
      },

      // ── DISPUTES ──
      disputes: {
        total: dAgg.total ?? 0,
        open: dAgg.open ?? 0,
        byCategory: groupedToCounts(dF.byCategory),
        byStatus: groupedToCounts(dF.byStatus),
        resolutionRate: dAgg.total > 0
          ? Math.round(((groupedToCounts(dF.byStatus).resolved ?? 0) + (groupedToCounts(dF.byStatus).closed ?? 0)) / dAgg.total * 100)
          : 0,
      },

      // ── APPLICATIONS ──
      applications: {
        total: appAgg.total ?? 0,
        byStatus: groupedToCounts(appF.byStatus),
        approvalRate: appAgg.total > 0
          ? Math.round(((groupedToCounts(appF.byStatus).approved ?? 0) / appAgg.total) * 100)
          : 0,
      },

      // ── REVIEWS ──
      reviews: {
        total: rAgg.total ?? 0,
        verified: rAgg.verified ?? 0,
        avgRating: rAgg.avgRating ? Math.round(rAgg.avgRating * 10) / 10 : 0,
        avgSubRatings: rAgg.total > 0 ? {
          landlordResponsive: rAgg.avgLandlordResponsive ? Math.round(rAgg.avgLandlordResponsive * 10) / 10 : 0,
          maintenance: rAgg.avgMaintenance ? Math.round(rAgg.avgMaintenance * 10) / 10 : 0,
          valueForMoney: rAgg.avgValueForMoney ? Math.round(rAgg.avgValueForMoney * 10) / 10 : 0,
          neighborhood: rAgg.avgNeighborhood ? Math.round(rAgg.avgNeighborhood * 10) / 10 : 0,
        } : { landlordResponsive: 0, maintenance: 0, valueForMoney: 0, neighborhood: 0 },
        wouldRecommendPercent: rAgg.total > 0 ? Math.round((rAgg.wouldRecommend ?? 0) / rAgg.total * 100) : 0,
      },

      // ── CREDIT SCORES ──
      creditScores: {
        total: cAgg.total ?? 0,
        avgScore: cAgg.avgScore ? Math.round(cAgg.avgScore) : 0,
        brackets: {
          excellent: cAgg.excellent ?? 0,
          good: cAgg.good ?? 0,
          fair: cAgg.fair ?? 0,
          poor: cAgg.poor ?? 0,
        },
      },

      // ── INVESTMENTS ──
      investments: {
        total: iAgg.total ?? 0,
        totalInvested: iAgg.totalInvested ?? 0,
        totalExpectedReturn: iAgg.totalExpectedReturn ?? 0,
        byStatus: groupedToCounts(iF.byStatus),
        byType: groupedToCounts(iF.byType),
      },

      // ── LOANS ──
      loans: {
        total: lAgg.total ?? 0,
        totalDisbursed: lAgg.totalAmount ?? 0,
        totalRepaid: lAgg.totalRepaid ?? 0,
        totalOutstanding: lAgg.totalOutstanding ?? 0,
        byStatus: groupedToCounts(lF.byStatus),
        defaultRate: lAgg.total > 0
          ? Math.round((groupedToCounts(lF.byStatus).defaulted ?? 0) / lAgg.total * 100)
          : 0,
      },

      // ── TENANT PROFILES ──
      tenantProfiles: {
        total: tAgg.total ?? 0,
        complete: tAgg.complete ?? 0,
        avgCompletionScore: tAgg.avgCompletionScore ? Math.round(tAgg.avgCompletionScore) : 0,
        idVerified: tAgg.idVerified ?? 0,
        incomeVerified: tAgg.incomeVerified ?? 0,
      },

      // ── WALLETS ──
      wallets: {
        total: wAgg.total ?? 0,
        totalBalance: wAgg.totalBalance ?? 0,
        totalTransactions: wAgg.totalTransactions ?? 0,
      },

      // ── SAVINGS (RENTGUARD) ──
      savings: {
        totalPlans: sAgg.total ?? 0,
        byStatus: groupedToCounts(sF.byStatus),
        activeSavers: sF.activeSavers?.[0]?.n ?? 0,
        totalSaved: sAgg.totalSaved ?? 0,
        totalTargeted: sAgg.totalTargeted ?? 0,
        completionRate: sAgg.total > 0 ? Math.round((groupedToCounts(sF.byStatus).completed ?? 0) / sAgg.total * 100) : 0,
        savingsProgress: (sAgg.totalTargeted ?? 0) > 0 ? Math.round((sAgg.totalSaved ?? 0) / sAgg.totalTargeted * 100) : 0,
      },

      // ── NOTIFICATIONS ──
      notifications: {
        total: nAgg.total ?? 0,
        unread: nAgg.unread ?? 0,
        byChannel: groupedToCounts(nF.byChannel),
      },

      // ── MESSAGING ──
      messaging: {
        conversations: conversationsAgg,
        totalMessages: mAgg.total ?? 0,
        unreadMessages: mAgg.unread ?? 0,
      },

      // ── FAVORITES ──
      favorites: {
        total: favoritesAgg,
      },

      // ── INVITATIONS ──
      invitations: {
        total: invAgg.total ?? 0,
        byStatus: groupedToCounts(invF.byStatus),
      },

      // ── DOCUMENTS ──
      documents: {
        total: docAgg.total ?? 0,
        byType: groupedToCounts(docF.byType),
        totalFileSize: docAgg.totalFileSize ?? 0,
      },

      // ── AUDIT LOGS ──
      auditLogs: {
        total: audAgg.total ?? 0,
        byAction: groupedToCounts(audF.byAction),
        byEntity: groupedToCounts(audF.byEntity),
      },
    }
    await cache.set(cacheKey, result, 3600) // 1 hour TTL
    success(res, result)
  },
}

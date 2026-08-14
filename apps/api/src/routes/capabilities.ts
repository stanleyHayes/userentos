import { Router } from 'express'
import { z } from 'zod'
import { authenticate, requireRole } from '../middleware/auth.js'
import { CapabilityRecord } from '../models/CapabilityRecord.js'
import type { CapabilityKind } from '../models/CapabilityRecord.js'
import { Agreement } from '../models/Agreement.js'
import { Payment } from '../models/Payment.js'
import { Property } from '../models/Property.js'
import { FinancingApplication } from '../models/FinancingApplication.js'
import { FinancingOffer } from '../models/FinancingOffer.js'
import { FinancingContract } from '../models/FinancingContract.js'
import { Lead } from '../models/Lead.js'
import { Viewing } from '../models/Viewing.js'
import { Commission } from '../models/Commission.js'
import { CreditScore } from '../models/CreditScore.js'
import { User } from '../models/User.js'
import { Business } from '../models/Business.js'
import { creditWallet, debitWallet } from '../services/payments/walletLedger.js'
import { Employer } from '../models/Employer.js'
import { PayrollRun } from '../models/PayrollRun.js'
import { TenantProfile } from '../models/TenantProfile.js'
import { canCreateWorkflow, rowsToCsv } from '../services/capabilityLogic.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'

const router = Router()
const idOf = (doc: Record<string, unknown>) => ({ ...doc, id: String(doc._id) })
const sendCsv = (res: Parameters<typeof success>[0], name: string, rows: Record<string, unknown>[]) => {
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
  res.send(rowsToCsv(rows))
}

router.get('/tenant/rental-history.csv', authenticate, requireRole('tenant'), async (req, res) => {
  const agreements = await Agreement.find({ tenantId: req.user!.userId }).sort({ startDate: -1 }).lean()
  sendCsv(res, 'rentos-rental-history.csv', agreements.map((item) => ({
    agreementId: item._id, propertyId: item.propertyId, startDate: item.startDate,
    endDate: item.endDate, monthlyRent: item.rentAmount, status: item.status,
  })))
})

router.get('/agent/performance', authenticate, requireRole('property_manager', 'landlord'), async (req, res) => {
  const agentId = req.user!.userId
  const [leads, viewings, commissions, properties] = await Promise.all([
    Lead.find({ agentId }).lean(), Viewing.find({ agentId }).lean(),
    Commission.find({ agentId }).lean(), Property.find({ $or: [{ landlordId: agentId }, { managerId: agentId }] }).lean(),
  ])
  const closedLeads = leads.filter((item) => item.status === 'closed')
  const closed = closedLeads.length
  const closeDurations = closedLeads.map((item) =>
    Math.max(0, new Date(item.updatedAt).getTime() - new Date(item.createdAt).getTime()))
  success(res, {
    totalLeads: leads.length, closedLeads: closed,
    closeRate: leads.length ? Math.round((closed / leads.length) * 1000) / 10 : 0,
    completedViewings: viewings.filter((item) => item.status === 'completed').length,
    commissionValue: commissions.reduce((sum, item) => sum + (item.amount ?? 0), 0),
    portfolioValue: properties.reduce((sum, item) => sum + (item.rentAmount ?? 0), 0),
    averageDaysToClose: closeDurations.length ? Math.round(closeDurations.reduce((sum, duration) => sum + duration, 0) / closeDurations.length / 86400000) : 0,
  })
})

const workflowSchema = z.object({
  kind: z.enum(['provider_payout', 'business_order', 'business_campaign', 'business_subscription', 'housing_benefit', 'developer_profile', 'offplan_listing']),
  participantId: z.string().optional(),
  status: z.string().min(1).max(40).default('active'),
  data: z.record(z.string(), z.unknown()).default({}),
})

router.post('/workflows', authenticate, async (req, res) => {
  const parsed = workflowSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  if (!canCreateWorkflow(parsed.data.kind, req.user!.roles)) {
    error(res, 'This workflow is not available for your role', 403)
    return
  }
  const requestedAmount = Number(parsed.data.data.amount ?? 0)
  let refund: { amount: number; reference: string; description: string } | undefined
  let previousBusiness: { subscriptionTier?: string; featuredUntil?: Date | null } | null = null
  if (parsed.data.kind === 'provider_payout') {
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) { error(res, 'Enter a valid payout amount'); return }
    const reference = `PROVIDER-PAYOUT-${Date.now()}`
    const debited = await debitWallet(req.user!.userId, requestedAmount, { type: 'withdrawal', reference, description: 'Provider MoMo payout request' })
    if (!debited) { error(res, 'Insufficient wallet balance', 409); return }
    refund = { amount: requestedAmount, reference: `${reference}-REVERSAL`, description: 'Reversed provider payout request' }
    parsed.data.status = 'queued'
  }
  if (parsed.data.kind === 'business_subscription') {
    const price = requestedAmount || 50
    const business = await Business.findOne({ ownerId: req.user!.userId }).lean()
    if (!business) { error(res, 'Create your business profile first', 400); return }
    previousBusiness = { subscriptionTier: business.subscriptionTier, featuredUntil: business.featuredUntil }
    const reference = `BUSINESS-FEATURED-${Date.now()}`
    const debited = await debitWallet(req.user!.userId, price, { type: 'subscription', reference, description: 'Business featured subscription' })
    if (!debited) { error(res, 'Insufficient wallet balance', 409); return }
    refund = { amount: price, reference: `${reference}-REVERSAL`, description: 'Reversed featured subscription' }
    try {
      const updated = await Business.findOneAndUpdate({ ownerId: req.user!.userId }, {
        subscriptionTier: 'featured',
        featuredUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
      if (!updated) throw new Error('Business profile disappeared while enabling subscription')
    } catch (subscriptionError) {
      await creditWallet(req.user!.userId, price, {
        type: 'refund',
        reference: refund.reference,
        description: refund.description,
      })
      throw subscriptionError
    }
    parsed.data.status = 'paid'
  }
  try {
    const record = await CapabilityRecord.create({ ...parsed.data, ownerId: req.user!.userId })
    success(res, idOf(record.toObject() as unknown as Record<string, unknown>), 'Workflow created', 201)
  } catch (workflowError) {
    if (previousBusiness) {
      await Business.findOneAndUpdate({ ownerId: req.user!.userId }, {
        subscriptionTier: previousBusiness.subscriptionTier ?? 'free',
        featuredUntil: previousBusiness.featuredUntil ?? null,
      })
    }
    if (refund) {
      await creditWallet(req.user!.userId, refund.amount, {
        type: 'refund',
        reference: refund.reference,
        description: refund.description,
      })
    }
    throw workflowError
  }
})

router.get('/workflows', authenticate, async (req, res) => {
  const kind = typeof req.query.kind === 'string' ? req.query.kind as CapabilityKind : undefined
  const items = await CapabilityRecord.find({
    ...(kind ? { kind } : {}),
    $or: [{ ownerId: req.user!.userId }, { participantId: req.user!.userId }],
  }).sort({ createdAt: -1 }).limit(200).lean()
  success(res, { items: items.map((item) => idOf(item as unknown as Record<string, unknown>)) })
})

router.patch('/workflows/:id', authenticate, async (req, res) => {
  const parsed = z.object({ status: z.string().min(1).max(40), data: z.record(z.string(), z.unknown()).optional() }).safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const item = await CapabilityRecord.findOneAndUpdate(
    { _id: param(req.params.id), $or: [{ ownerId: req.user!.userId }, { participantId: req.user!.userId }] },
    { $set: {
      status: parsed.data.status,
      ...(parsed.data.data ? Object.fromEntries(Object.entries(parsed.data.data).map(([key, value]) => [`data.${key}`, value])) : {}),
    } },
    { new: true },
  ).lean()
  if (!item) { error(res, 'Workflow not found', 404); return }
  success(res, idOf(item as unknown as Record<string, unknown>), 'Workflow updated')
})

router.get('/financier/decision/:applicationId', authenticate, requireRole('financier'), async (req, res) => {
  const application = await FinancingApplication.findOne({ _id: param(req.params.applicationId), financierId: req.user!.userId }).lean()
  if (!application) { error(res, 'Application not found', 404); return }
  const applicantId = application.applicantId
  const [score, agreements, payments] = await Promise.all([
    CreditScore.findOne({ userId: applicantId }).lean(),
    Agreement.find({ tenantId: applicantId }).lean(),
    Payment.find({ tenantId: applicantId }).lean(),
  ])
  success(res, {
    application,
    creditScore: score,
    rentalHistory: { agreements: agreements.length, completed: agreements.filter((item) => item.status === 'terminated').length },
    paymentHistory: { total: payments.length, completed: payments.filter((item) => item.status === 'completed').length, failed: payments.filter((item) => item.status === 'failed').length },
  })
})

router.get('/financier/targeting', authenticate, requireRole('financier'), async (req, res) => {
  const [applications, offers] = await Promise.all([
    FinancingApplication.find({ financierId: req.user!.userId }).lean(),
    FinancingOffer.find({ financierId: req.user!.userId }).lean(),
  ])
  success(res, {
    totalApplications: applications.length,
    employedApplicants: applications.filter((item) => Boolean(item.employerId)).length,
    offers: offers.map((offer) => ({
      id: offer._id.toString(), name: offer.name, minCreditScore: offer.minCreditScore,
      requiresEmployment: offer.requiresEmployment,
      eligibleApplications: applications.filter((application) =>
        (application.creditScoreAtApply ?? 0) >= offer.minCreditScore
        && (!offer.requiresEmployment || Boolean(application.employerId)),
      ).length,
    })),
    statusBreakdown: Object.entries(applications.reduce<Record<string, number>>((acc, item) => { acc[item.status] = (acc[item.status] ?? 0) + 1; return acc }, {})).map(([status, count]) => ({ status, count })),
  })
})

router.get('/financier/securitized-report.csv', authenticate, requireRole('financier'), async (req, res) => {
  const contracts = await FinancingContract.find({ financierId: req.user!.userId }).sort({ createdAt: -1 }).limit(5000).lean()
  sendCsv(res, 'bog-securitized-report.csv', contracts.map((item) => ({
    contractId: item._id, productType: item.productType, principal: item.principal,
    totalRepayable: item.totalRepayable, amountRepaid: item.amountRepaid, status: item.status,
  })))
})

router.get('/government/tax-compliance', authenticate, requireRole('government', 'admin'), async (_req, res) => {
  const consenting = await User.find({ roles: 'landlord', taxReportingConsent: true }).select('_id').lean()
  const consentingIds = consenting.map((user) => user._id.toString())
  const rows = await Payment.aggregate([
    { $match: { status: 'completed', landlordId: { $in: consentingIds } } },
    { $group: { _id: '$landlordId', grossRent: { $sum: '$amount' }, payments: { $sum: 1 } } },
    { $sort: { grossRent: -1 } },
  ])
  success(res, { items: rows.map((item) => ({ landlordId: item._id, grossRent: item.grossRent, payments: item.payments })) })
})

router.get('/government/fraud-watch', authenticate, requireRole('government', 'admin'), async (_req, res) => {
  const [duplicates, suspiciousPayments] = await Promise.all([
    Property.aggregate([
      { $group: { _id: { title: '$title', city: '$address.city', rent: '$rentAmount' }, ids: { $push: '$_id' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ]),
    Payment.find({ status: 'failed' }).sort({ createdAt: -1 }).limit(100).lean(),
  ])
  success(res, { duplicateListings: duplicates, suspiciousPayments })
})

router.get('/government/national-rental-export.csv', authenticate, requireRole('government', 'admin'), async (_req, res) => {
  const properties = await Property.find({}).lean()
  sendCsv(res, 'national-rental-database-anonymized.csv', properties.map((item) => ({
    region: item.address?.region, city: item.address?.city, type: item.type,
    bedrooms: item.bedrooms, rentAmount: item.rentAmount, status: item.status, createdAt: (item as unknown as { createdAt?: Date }).createdAt,
  })))
})

router.get('/developer/market', authenticate, requireRole('developer', 'landlord', 'property_manager', 'admin'), async (_req, res) => {
  const [rows, demographics] = await Promise.all([Property.aggregate([
    { $group: { _id: { city: '$address.city', type: '$type' }, listings: { $sum: 1 }, averageRent: { $avg: '$rentAmount' }, bedrooms: { $avg: '$bedrooms' } } },
    { $sort: { listings: -1 } },
  ]), TenantProfile.aggregate([
    { $group: { _id: '$employmentStatus', households: { $sum: 1 }, averageIncome: { $avg: '$monthlyIncome' }, averageOccupants: { $avg: '$numberOfOccupants' } } },
    { $sort: { households: -1 } },
  ])])
  success(res, {
    items: rows.map((item) => ({ city: item._id.city, type: item._id.type, listings: item.listings, averageRent: Math.round(item.averageRent ?? 0), averageBedrooms: Math.round((item.bedrooms ?? 0) * 10) / 10 })),
    demographics: demographics.map((item) => ({ employmentStatus: item._id || 'not stated', households: item.households, averageIncome: Math.round(item.averageIncome ?? 0), averageOccupants: Math.round((item.averageOccupants ?? 0) * 10) / 10 })),
  })
})

router.get('/developer/offplan', async (_req, res) => {
  const items = await CapabilityRecord.find({ kind: 'offplan_listing', status: { $in: ['active', 'published'] } }).sort({ createdAt: -1 }).limit(100).lean()
  success(res, { items: items.map((item) => idOf(item as unknown as Record<string, unknown>)) })
})

router.get('/employer/compliance.csv', authenticate, requireRole('employer'), async (req, res) => {
  const employer = await Employer.findOne({ ownerId: req.user!.userId }).lean()
  if (!employer) { error(res, 'Employer profile not found', 404); return }
  const runs = await PayrollRun.find({ employerId: employer._id.toString(), status: 'processed' }).sort({ periodStart: -1 }).lean()
  sendCsv(res, 'ssnit-tax-deduction-report.csv', runs.flatMap((run) => run.deductions.map((deduction) => ({
    employerTIN: employer.tin, ssnitEmployerNumber: employer.ssnitEmployerNumber,
    period: run.periodLabel, employeeId: deduction.employeeId, employeeName: deduction.employeeName,
    allocationType: deduction.allocationType, amount: deduction.amount, status: deduction.status,
  }))))
})

export default router

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
import { withMoneyTransaction, InsufficientFundsError } from '../services/payments/moneyTransaction.js'
import { requireRegulatedFeature } from '../middleware/regulatedFeature.js'
import { Employer } from '../models/Employer.js'
import { PayrollRun } from '../models/PayrollRun.js'
import { TenantProfile } from '../models/TenantProfile.js'
import {
  canCreateWorkflow, rowsToCsv, initialWorkflowStatus, ownerMaySetStatus,
  BUSINESS_FEATURED_PRICE_GHS, BUSINESS_FEATURED_DAYS, PUBLIC_OFFPLAN_STATUSES,
} from '../services/capabilityLogic.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { signedTenancyFilter } from '../services/tenancyRelationship.js'

const router = Router()
const idOf = (doc: Record<string, unknown>) => ({ ...doc, id: String(doc._id) })
const sendCsv = (res: Parameters<typeof success>[0], name: string, rows: Record<string, unknown>[]) => {
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
  res.send(rowsToCsv(rows))
}

// Rental history is tenancies the tenant signed, not drafts a landlord addressed to them.
router.get('/tenant/rental-history.csv', authenticate, requireRole('tenant'), async (req, res) => {
  const agreements = await Agreement.find(signedTenancyFilter({ tenantId: req.user!.userId })).sort({ startDate: -1 }).lean()
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
  // Withdrawals are POST /api/payouts; there is no provider payout workflow.
  kind: z.enum(['business_order', 'business_campaign', 'business_subscription', 'housing_benefit', 'developer_profile', 'offplan_listing']),
  participantId: z.string().optional(),
  status: z.string().min(1).max(40).default('active'),
  data: z.record(z.string(), z.unknown()).default({}),
})

/** Buying a featured listing debits the stored-value wallet: a regulated activity, gated like /api/savings. */
const walletGate = requireRegulatedFeature('wallet')

router.post('/workflows', authenticate, (req, res, next) => (req.body?.kind === 'business_subscription' ? walletGate(req, res, next) : next()), async (req, res) => {
  const parsed = workflowSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  if (!canCreateWorkflow(parsed.data.kind, req.user!.roles)) {
    error(res, 'This workflow is not available for your role', 403)
    return
  }
  parsed.data.status = initialWorkflowStatus(parsed.data.kind, parsed.data.status)
  if (parsed.data.kind !== 'business_subscription') {
    const record = await CapabilityRecord.create({ ...parsed.data, ownerId: req.user!.userId })
    success(res, idOf(record.toObject() as unknown as Record<string, unknown>), 'Workflow created', 201)
    return
  }

  // The server's price, whatever the request says; the record shows what
  // was actually charged.
  const price = BUSINESS_FEATURED_PRICE_GHS
  parsed.data.data = { ...parsed.data.data, amount: price, days: BUSINESS_FEATURED_DAYS }
  parsed.data.status = 'paid'
  const business = await Business.findOne({ ownerId: req.user!.userId }).lean()
  if (!business) { error(res, 'Create your business profile first', 400); return }
  const previous = { subscriptionTier: business.subscriptionTier ?? 'free', featuredUntil: business.featuredUntil ?? null }
  const reference = `BUSINESS-FEATURED-${Date.now()}`

  // Debit, feature the business and record the purchase in one transaction;
  // on a standalone Mongo each step is undone if a later one fails.
  let record
  try {
    record = await withMoneyTransaction(async ({ session, onRollback }) => {
      const debited = await debitWallet(req.user!.userId, price, { type: 'subscription', reference, description: 'Business featured subscription' }, { session })
      if (!debited) throw new InsufficientFundsError()
      onRollback(() => creditWallet(req.user!.userId, price, { type: 'refund', reference: `${reference}-REVERSAL`, description: 'Reversed featured subscription' }))
      const updated = await Business.findOneAndUpdate({ ownerId: req.user!.userId }, {
        subscriptionTier: 'featured',
        featuredUntil: new Date(Date.now() + BUSINESS_FEATURED_DAYS * 24 * 60 * 60 * 1000),
      }, { session })
      if (!updated) throw new Error('Business profile disappeared while enabling subscription')
      onRollback(() => Business.findOneAndUpdate({ ownerId: req.user!.userId }, previous))
      const doc = { ...parsed.data, ownerId: req.user!.userId }
      return session ? (await CapabilityRecord.create([doc], { session }))[0] : await CapabilityRecord.create(doc)
    })
  } catch (err) {
    if (err instanceof InsufficientFundsError) { error(res, 'Insufficient wallet balance', 409); return }
    throw err
  }
  success(res, idOf(record.toObject() as unknown as Record<string, unknown>), 'Workflow created', 201)
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
  const scope = { _id: param(req.params.id), $or: [{ ownerId: req.user!.userId }, { participantId: req.user!.userId }] }
  const existing = await CapabilityRecord.findOne(scope).select('kind status').lean()
  if (!existing) { error(res, 'Workflow not found', 404); return }
  if (!ownerMaySetStatus(existing.kind, parsed.data.status)) {
    error(res, 'An off-plan listing is published by moderation, not by its author', 403)
    return
  }
  // Editing a listing that is already public sends it back for review, so an
  // approved listing cannot be rewritten into something that was never checked.
  const status = existing.kind === 'offplan_listing' && parsed.data.data && !ownerMaySetStatus(existing.kind, existing.status)
    ? 'pending_review'
    : parsed.data.status
  const item = await CapabilityRecord.findOneAndUpdate(
    // Conditional on the status just read: a concurrent approval is not
    // overwritten by a stale edit.
    { ...scope, status: existing.status },
    { $set: {
      status,
      ...(parsed.data.data ? Object.fromEntries(Object.entries(parsed.data.data).map(([key, value]) => [`data.${key}`, value])) : {}),
    } },
    { returnDocument: 'after' },
  ).lean()
  if (!item) { error(res, 'This workflow changed while you were editing it. Refresh and try again.', 409); return }
  success(res, idOf(item as unknown as Record<string, unknown>), 'Workflow updated')
})

router.get('/workflows/review-queue', authenticate, requireRole('admin', 'super_admin'), async (_req, res) => {
  const items = await CapabilityRecord.find({ kind: 'offplan_listing', status: 'pending_review' }).sort({ updatedAt: 1 }).limit(200).lean()
  success(res, { items: items.map((item) => idOf(item as unknown as Record<string, unknown>)) })
})

/** Moderation of an off-plan listing: the only way one becomes public. */
router.post('/workflows/:id/review', authenticate, requireRole('admin', 'super_admin'), async (req, res) => {
  const parsed = z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().max(500).optional() }).safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const item = await CapabilityRecord.findOneAndUpdate(
    { _id: param(req.params.id), kind: 'offplan_listing' },
    { $set: {
      status: parsed.data.decision === 'approve' ? 'active' : 'rejected',
      'data.reviewedBy': req.user!.userId,
      'data.reviewedAt': new Date().toISOString(),
      ...(parsed.data.reason ? { 'data.reviewReason': parsed.data.reason } : {}),
    } },
    { returnDocument: 'after' },
  ).lean()
  if (!item) { error(res, 'Listing not found', 404); return }
  success(res, idOf(item as unknown as Record<string, unknown>), parsed.data.decision === 'approve' ? 'Listing published' : 'Listing rejected')
})

router.get('/financier/decision/:applicationId', authenticate, requireRole('financier'), async (req, res) => {
  const application = await FinancingApplication.findOne({ _id: param(req.params.applicationId), financierId: req.user!.userId }).lean()
  if (!application) { error(res, 'Application not found', 404); return }
  const applicantId = application.applicantId
  const [score, agreements, payments] = await Promise.all([
    CreditScore.findOne({ userId: applicantId }).lean(),
    // A credit decision must not count leases the applicant never signed.
    Agreement.find(signedTenancyFilter({ tenantId: applicantId })).lean(),
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
  // Neutral names: this is the financier's own data, not a Bank of Ghana or
  // SSNIT filing, and the file name must not suggest one.
  sendCsv(res, 'rentos-portfolio-export.csv', contracts.map((item) => ({
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
    // Only what a fraud signal needs. This returned whole payment documents —
    // payer and payee ids, references, provider responses — to every
    // government account, for a card that only shows a count.
    Payment.find({ status: 'failed' }).sort({ createdAt: -1 }).limit(100).select('amount method purpose createdAt').lean(),
  ])
  success(res, {
    duplicateListings: duplicates,
    suspiciousPayments: suspiciousPayments.map((p) => ({ id: String(p._id), amount: p.amount, method: p.method, purpose: p.purpose, createdAt: (p as { createdAt?: Date }).createdAt })),
  })
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
    { $group: { _id: '$employmentStatus', households: { $sum: 1 }, averageIncome: { $avg: { $cond: [{ $eq: [{ $ifNull: ['$primaryCurrency', 'GHS'] }, 'GHS'] }, '$monthlyIncome', null] } }, averageOccupants: { $avg: '$numberOfOccupants' } } },
    { $sort: { households: -1 } },
  ])])
  success(res, {
    items: rows.map((item) => ({ city: item._id.city, type: item._id.type, listings: item.listings, averageRent: Math.round(item.averageRent ?? 0), averageBedrooms: Math.round((item.bedrooms ?? 0) * 10) / 10 })),
    demographics: demographics.map((item) => ({ employmentStatus: item._id || 'not stated', households: item.households, averageIncome: Math.round(item.averageIncome ?? 0), averageOccupants: Math.round((item.averageOccupants ?? 0) * 10) / 10 })),
  })
})

/**
 * The public developments page. Account ids and the admin's review stamp
 * (reviewedBy, reviewedAt, reviewReason) are internal, as they are on every
 * other public view, so they are stripped rather than served to anyone.
 */
router.get('/developer/offplan', async (_req, res) => {
  const items = await CapabilityRecord.find({ kind: 'offplan_listing', status: { $in: PUBLIC_OFFPLAN_STATUSES } }).sort({ createdAt: -1 }).limit(100).lean()
  success(res, { items: items.map((item) => {
    const { ownerId: _o, participantId: _p, data, ...rest } = item as unknown as Record<string, unknown> & { data?: Record<string, unknown> }
    const { reviewedBy: _rb, reviewedAt: _ra, reviewReason: _rr, ...publicData } = data ?? {}
    return { ...idOf(rest), data: publicData }
  }) })
})

router.get('/employer/compliance.csv', authenticate, requireRole('employer'), async (req, res) => {
  const employer = await Employer.findOne({ ownerId: req.user!.userId }).lean()
  if (!employer) { error(res, 'Employer profile not found', 404); return }
  const runs = await PayrollRun.find({ employerId: employer._id.toString(), status: 'processed' }).sort({ periodStart: -1 }).lean()
  sendCsv(res, 'rentos-payroll-deduction-export.csv', runs.flatMap((run) => run.deductions.map((deduction) => ({
    employerTIN: employer.tin, ssnitEmployerNumber: employer.ssnitEmployerNumber,
    period: run.periodLabel, employeeId: deduction.employeeId, employeeName: deduction.employeeName,
    allocationType: deduction.allocationType, amount: deduction.amount, status: deduction.status,
  }))))
})

export default router

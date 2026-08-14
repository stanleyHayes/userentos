import { Router } from 'express'
import { z } from 'zod'
import { authenticate, requireRole } from '../middleware/auth.js'
import { Property } from '../models/Property.js'
import { Agreement } from '../models/Agreement.js'
import { Payment } from '../models/Payment.js'
import { Dispute } from '../models/Dispute.js'
import { MaintenanceRequest } from '../models/MaintenanceRequest.js'
import { success, error } from '../utils/response.js'
import { analyzePropertyPricing } from '../services/pricing.js'

const router = Router()

// Simulate impact of a rent cap policy
router.post('/rent-cap', authenticate, requireRole('government', 'admin', 'legal_officer'), async (req, res) => {
  const schema = z.object({
    maxRent: z.number().positive(),
    region: z.string().optional(),
    propertyType: z.string().optional(),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const { maxRent, region, propertyType } = parsed.data

  const filter: Record<string, unknown> = {}
  if (region) filter['address.region'] = region
  if (propertyType) filter.type = propertyType

  // Aggregated in Mongo — previously this loaded every property into memory.
  const [result] = await Property.aggregate([
    { $match: filter },
    { $facet: {
      totals: [{ $group: {
        _id: null,
        total: { $sum: 1 },
        avgRent: { $avg: '$rentAmount' },
        affected: { $sum: { $cond: [{ $gt: ['$rentAmount', maxRent] }, 1, 0] } },
        totalReduction: { $sum: { $cond: [{ $gt: ['$rentAmount', maxRent] }, { $subtract: ['$rentAmount', maxRent] }, 0] } },
        newAvgRent: { $avg: { $min: ['$rentAmount', maxRent] } },
      } }],
      topAffected: [
        { $match: { rentAmount: { $gt: maxRent } } },
        { $sort: { rentAmount: -1 } },
        { $limit: 10 },
        { $project: { title: 1, rentAmount: 1, type: 1, 'address.region': 1 } },
      ],
    }},
  ])

  const totals = result?.totals?.[0] ?? {}
  const totalProperties = totals.total ?? 0
  const totalReduction = Math.round((totals.totalReduction ?? 0) * 100) / 100

  success(res, {
    policy: { maxRent, region: region || 'All regions', propertyType: propertyType || 'All types' },
    totalProperties,
    affectedProperties: totals.affected ?? 0,
    affectedPercentage: totalProperties > 0 ? Math.round(((totals.affected ?? 0) / totalProperties) * 100) : 0,
    currentAvgRent: Math.round(totals.avgRent ?? 0),
    newAvgRent: Math.round(totals.newAvgRent ?? 0),
    totalMonthlyReduction: totalReduction,
    annualSavingsForTenants: Math.round(totalReduction * 12 * 100) / 100,
    estimatedRevenueImpact: -totalReduction,
    affectedPropertyDetails: (result?.topAffected ?? []).map((p: { title: string; rentAmount: number; type: string; address: { region?: string } }) => ({
      title: p.title,
      currentRent: p.rentAmount,
      newRent: maxRent,
      reduction: Math.round((p.rentAmount - maxRent) * 100) / 100,
      region: p.address?.region,
      type: p.type,
    })),
  })
})

// Simulate impact of advance month limit changes
router.post('/advance-limit', authenticate, requireRole('government', 'admin', 'legal_officer'), async (req, res) => {
  const schema = z.object({ maxMonths: z.number().int().min(1).max(24) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const { maxMonths } = parsed.data

  // Aggregated in Mongo — previously this loaded every agreement + property.
  const [agreementAgg, affectedProps] = await Promise.all([
    Agreement.aggregate([
      { $group: {
        _id: null,
        total: { $sum: 1 },
        affected: { $sum: { $cond: [{ $gt: ['$advanceMonths', maxMonths] }, 1, 0] } },
        avgAdvance: { $avg: '$advanceMonths' },
        tenantRelief: { $sum: { $cond: [{ $gt: ['$advanceMonths', maxMonths] }, { $multiply: [{ $subtract: ['$advanceMonths', maxMonths] }, '$rentAmount'] }, 0] } },
      } },
    ]),
    Property.countDocuments({ advanceMonths: { $gt: maxMonths } }),
  ])

  const totals = agreementAgg[0] ?? {}
  const totalAgreements = totals.total ?? 0

  success(res, {
    policy: { maxAdvanceMonths: maxMonths },
    totalAgreements,
    affectedAgreements: totals.affected ?? 0,
    affectedPercentage: totalAgreements > 0 ? Math.round(((totals.affected ?? 0) / totalAgreements) * 100) : 0,
    totalPropertiesAffected: affectedProps,
    currentAvgAdvance: Math.round((totals.avgAdvance ?? 0) * 10) / 10,
    estimatedTenantRelief: Math.round((totals.tenantRelief ?? 0) * 100) / 100,
  })
})

// Get market health indicators
router.get('/market-health', authenticate, requireRole('government', 'admin', 'legal_officer'), async (_req, res) => {
  // All indicators via aggregation — previously four full-collection scans.
  const [propertyAgg, agreementAgg, paymentMonthly, disputeAgg] = await Promise.all([
    Property.aggregate([
      { $group: {
        _id: null,
        total: { $sum: 1 },
        available: { $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] } },
      } },
    ]),
    Agreement.aggregate([
      { $group: {
        _id: null,
        total: { $sum: 1 },
        // $ifNull guards legacy agreements that predate the complianceFlags field
        compliant: { $sum: { $cond: [{ $eq: [{ $size: { $ifNull: ['$complianceFlags', []] } }, 0] }, 1, 0] } },
      } },
    ]),
    Payment.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: { $substr: ['$paidAt', 0, 7] }, volume: { $sum: '$amount' } } },
      { $sort: { _id: 1 } },
    ]),
    Dispute.aggregate([
      { $group: {
        _id: null,
        open: { $sum: { $cond: [{ $and: [{ $ne: ['$status', 'resolved'] }, { $ne: ['$status', 'closed'] }] }, 1, 0] } },
      } },
    ]),
  ])

  const totalProps = propertyAgg[0]?.total ?? 0
  const vacancyRate = totalProps > 0 ? Math.round(((propertyAgg[0]?.available ?? 0) / totalProps) * 100) : 0
  const disputeRate = totalProps > 0 ? Math.round(((disputeAgg[0]?.open ?? 0) / totalProps) * 100) : 0
  const complianceRate = (agreementAgg[0]?.total ?? 0) > 0
    ? Math.round(((agreementAgg[0]?.compliant ?? 0) / agreementAgg[0].total) * 100)
    : 100

  // Monthly payment volume trend (guard against a zero previous month → Infinity)
  const months = paymentMonthly.filter((m) => m._id)
  const last = months.length >= 1 ? months[months.length - 1].volume : 0
  const prev = months.length >= 2 ? months[months.length - 2].volume : 0
  const trend = prev > 0 ? ((last - prev) / prev) * 100 : 0

  const overallScore = Math.round((complianceRate * 0.4 + (100 - vacancyRate) * 0.3 + (100 - disputeRate) * 0.3))
  const paymentTrend = Math.round(trend * 10) / 10

  const indicators = [
    {
      label: 'Vacancy Rate',
      value: `${vacancyRate}%`,
      trend: vacancyRate < 10 ? 'down' as const : vacancyRate < 25 ? 'stable' as const : 'up' as const,
      description: vacancyRate < 10 ? 'Healthy occupancy levels' : vacancyRate < 25 ? 'Moderate vacancy — monitor closely' : 'High vacancy — market concern',
    },
    {
      label: 'Dispute Rate',
      value: `${disputeRate}%`,
      trend: disputeRate < 5 ? 'down' as const : disputeRate < 15 ? 'stable' as const : 'up' as const,
      description: disputeRate < 5 ? 'Low dispute activity' : disputeRate < 15 ? 'Moderate dispute levels' : 'High dispute rate — needs attention',
    },
    {
      label: 'Compliance',
      value: `${complianceRate}%`,
      trend: complianceRate > 90 ? 'up' as const : complianceRate > 70 ? 'stable' as const : 'down' as const,
      description: complianceRate > 90 ? 'Strong regulatory compliance' : complianceRate > 70 ? 'Moderate compliance — room for improvement' : 'Low compliance — enforcement needed',
    },
    {
      label: 'Payment Growth',
      value: `${paymentTrend > 0 ? '+' : ''}${paymentTrend}%`,
      trend: paymentTrend > 5 ? 'up' as const : paymentTrend > -5 ? 'stable' as const : 'down' as const,
      description: paymentTrend > 5 ? 'Market is growing' : paymentTrend > -5 ? 'Stable payment volumes' : 'Declining payment activity',
    },
  ]

  const alerts: { level: 'info' | 'warning' | 'critical'; message: string }[] = []
  if (vacancyRate >= 25) alerts.push({ level: 'critical', message: `Vacancy rate at ${vacancyRate}% — exceeds healthy threshold` })
  else if (vacancyRate >= 10) alerts.push({ level: 'warning', message: `Vacancy rate at ${vacancyRate}% — approaching concern level` })
  if (disputeRate >= 15) alerts.push({ level: 'critical', message: `Dispute rate at ${disputeRate}% — requires immediate intervention` })
  else if (disputeRate >= 5) alerts.push({ level: 'warning', message: `Dispute rate at ${disputeRate}% — monitor closely` })
  if (complianceRate <= 70) alerts.push({ level: 'critical', message: `Compliance rate at ${complianceRate}% — enforcement action recommended` })
  else if (complianceRate <= 90) alerts.push({ level: 'warning', message: `Compliance rate at ${complianceRate}% — follow-up needed` })
  if (paymentTrend <= -5) alerts.push({ level: 'warning', message: `Payment volume declining at ${paymentTrend}%` })
  if (overallScore >= 80) alerts.push({ level: 'info', message: 'Market health is strong overall' })

  success(res, { overallScore, indicators, alerts })
})

/* ================================================================
   Rent Increase Analysis — check if a rent increase is excessive
   ================================================================ */

router.post('/rent-increase', authenticate, requireRole('government', 'admin', 'legal_officer'), async (req, res) => {
  const schema = z.object({
    propertyId: z.string(),
    currentRent: z.number().positive(),
    proposedRent: z.number().positive(),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const { propertyId, currentRent, proposedRent } = parsed.data

  const property = await Property.findById(propertyId).lean()
  if (!property) { error(res, 'Property not found', 404); return }

  const increaseAmount = proposedRent - currentRent
  const increasePct = currentRent > 0 ? (increaseAmount / currentRent) * 100 : 0

  // Get market comparables for fairness check
  const pricing = await analyzePropertyPricing(
    property.address.city,
    property.type as string,
    property.bedrooms as number,
    property.bathrooms as number,
    property.furnished as boolean,
    (property.amenities as string[]) ?? [],
    property.floorArea as number | undefined,
    propertyId,
  )

  const isExcessive = increasePct > 25 || proposedRent > pricing.marketMedian * 1.4
  const isModerate = increasePct > 15 || proposedRent > pricing.marketMedian * 1.2

  let verdict: string
  if (isExcessive) verdict = 'This rent increase appears excessive and may violate rent control regulations.'
  else if (isModerate) verdict = 'This rent increase is above typical market adjustments. Review recommended.'
  else verdict = 'This rent increase is within normal market parameters.'

  const riskLevel = isExcessive ? 'high' : isModerate ? 'medium' : 'low'

  success(res, {
    propertyId,
    currentRent,
    proposedRent,
    increaseAmount,
    increasePercentage: Math.round(increasePct * 10) / 10,
    marketMedian: pricing.marketMedian,
    marketAverage: pricing.marketAverage,
    comparableCount: pricing.comparableCount,
    verdict,
    riskLevel,
    isExcessive,
    legalLimit: 'Ghana Rent Act recommends reasonable increases (typically 10-15% annually)',
    suggestedMaxRent: Math.round(pricing.marketMedian * 1.25),
  })
})

/* ================================================================
   Property / Landlord Risk Score
   ================================================================ */

router.get('/risk-score/:propertyId', authenticate, requireRole('government', 'admin', 'legal_officer'), async (req, res) => {
  const propertyId = String(req.params.propertyId)

  const property = await Property.findById(propertyId).lean()
  if (!property) { error(res, 'Property not found', 404); return }

  const landlordId = property.landlordId as string

  // Count landlord's disputes
  const landlordDisputes = await Dispute.find({ landlordId }).lean()
  const openDisputes = landlordDisputes.filter(d => d.status !== 'resolved' && d.status !== 'closed').length
  const totalDisputes = landlordDisputes.length

  // Count landlord's maintenance issues
  const maintenanceIssues = await MaintenanceRequest.find({ landlordId }).lean()
  const overdueMaintenance = maintenanceIssues.filter(m => m.status !== 'completed' && m.status !== 'cancelled').length

  // Count compliance violations (agreements with flags)
  const agreements = await Agreement.find({ landlordId }).lean()
  const violations = agreements.filter(a => a.complianceFlags && a.complianceFlags.length > 0).length

  // Pricing fairness: is rent significantly above market?
  const pricing = await analyzePropertyPricing(
    property.address.city,
    property.type as string,
    property.bedrooms as number,
    property.bathrooms as number,
    property.furnished as boolean,
    (property.amenities as string[]) ?? [],
    property.floorArea as number | undefined,
    propertyId,
  )

  const rentPremium = pricing.marketMedian > 0
    ? ((property.rentAmount as number) - pricing.marketMedian) / pricing.marketMedian
    : 0

  // Calculate risk score (0-100, higher = riskier)
  let riskScore = 0
  const factors: { factor: string; points: number; detail: string }[] = []

  // Dispute history (max 30 pts)
  const disputePoints = Math.min(30, totalDisputes * 5 + openDisputes * 10)
  riskScore += disputePoints
  if (disputePoints > 0) factors.push({ factor: 'Dispute History', points: disputePoints, detail: `${totalDisputes} total, ${openDisputes} open` })

  // Maintenance responsiveness (max 25 pts)
  const maintenancePoints = Math.min(25, overdueMaintenance * 5)
  riskScore += maintenancePoints
  if (maintenancePoints > 0) factors.push({ factor: 'Maintenance Backlog', points: maintenancePoints, detail: `${overdueMaintenance} unresolved requests` })

  // Compliance violations (max 25 pts)
  const compliancePoints = Math.min(25, violations * 8)
  riskScore += compliancePoints
  if (compliancePoints > 0) factors.push({ factor: 'Compliance Violations', points: compliancePoints, detail: `${violations} flagged agreements` })

  // Rent pricing fairness (max 20 pts)
  const pricingPoints = rentPremium > 0.5 ? 20 : rentPremium > 0.3 ? 12 : rentPremium > 0.15 ? 5 : 0
  riskScore += pricingPoints
  if (pricingPoints > 0) factors.push({ factor: 'Above-Market Pricing', points: pricingPoints, detail: `${Math.round(rentPremium * 100)}% above median` })

  const riskLevel = riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low'

  success(res, {
    propertyId,
    landlordId,
    riskScore,
    riskLevel,
    factors,
    summary: riskLevel === 'high'
      ? 'This property/landlord presents elevated risk. Recommend inspection.'
      : riskLevel === 'medium'
        ? 'Some risk indicators present. Monitor closely.'
        : 'Low risk profile. Standard monitoring sufficient.',
    metrics: {
      totalDisputes,
      openDisputes,
      overdueMaintenance,
      complianceViolations: violations,
      rentPremiumPct: Math.round(rentPremium * 100),
      comparableCount: pricing.comparableCount,
    },
  })
})

export default router

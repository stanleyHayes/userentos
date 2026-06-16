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
  if (!parsed.success) { error(res, parsed.error.errors[0].message); return }

  const { maxRent, region, propertyType } = parsed.data

  const filter: Record<string, unknown> = {}
  if (region) filter['address.region'] = region
  if (propertyType) filter.type = propertyType

  const properties = await Property.find(filter).lean()
  const affected = properties.filter((p) => p.rentAmount > maxRent)
  const totalReduction = affected.reduce((s, p) => s + (p.rentAmount - maxRent), 0)

  success(res, {
    policy: { maxRent, region: region || 'All regions', propertyType: propertyType || 'All types' },
    totalProperties: properties.length,
    affectedProperties: affected.length,
    affectedPercentage: properties.length > 0 ? Math.round((affected.length / properties.length) * 100) : 0,
    currentAvgRent: properties.length > 0 ? Math.round(properties.reduce((s, p) => s + p.rentAmount, 0) / properties.length) : 0,
    newAvgRent: properties.length > 0 ? Math.round(properties.reduce((s, p) => s + Math.min(p.rentAmount, maxRent), 0) / properties.length) : 0,
    totalMonthlyReduction: totalReduction,
    annualSavingsForTenants: totalReduction * 12,
    estimatedRevenueImpact: -totalReduction,
    affectedPropertyDetails: affected.slice(0, 10).map((p) => ({
      title: p.title,
      currentRent: p.rentAmount,
      newRent: maxRent,
      reduction: p.rentAmount - maxRent,
      region: p.address.region,
      type: p.type,
    })),
  })
})

// Simulate impact of advance month limit changes
router.post('/advance-limit', authenticate, requireRole('government', 'admin', 'legal_officer'), async (req, res) => {
  const schema = z.object({ maxMonths: z.number().int().min(1).max(24) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.errors[0].message); return }

  const { maxMonths } = parsed.data

  const agreements = await Agreement.find().lean()
  const affected = agreements.filter((a) => a.advanceMonths > maxMonths)
  const properties = await Property.find().lean()
  const affectedProps = properties.filter((p) => p.advanceMonths > maxMonths)

  success(res, {
    policy: { maxAdvanceMonths: maxMonths },
    totalAgreements: agreements.length,
    affectedAgreements: affected.length,
    affectedPercentage: agreements.length > 0 ? Math.round((affected.length / agreements.length) * 100) : 0,
    totalPropertiesAffected: affectedProps.length,
    currentAvgAdvance: agreements.length > 0 ? Math.round((agreements.reduce((s, a) => s + a.advanceMonths, 0) / agreements.length) * 10) / 10 : 0,
    estimatedTenantRelief: affected.reduce((s, a) => s + (a.advanceMonths - maxMonths) * a.rentAmount, 0),
  })
})

// Get market health indicators
router.get('/market-health', authenticate, requireRole('government', 'admin', 'legal_officer'), async (_req, res) => {
  const [properties, agreements, payments, disputes] = await Promise.all([
    Property.find().lean(),
    Agreement.find().lean(),
    Payment.find({ status: 'completed' }).lean(),
    Dispute.find().lean(),
  ])

  const totalProps = properties.length || 1
  const vacancyRate = Math.round((properties.filter((p) => p.status === 'available').length / totalProps) * 100)
  const disputeRate = Math.round((disputes.filter((d) => d.status !== 'resolved' && d.status !== 'closed').length / totalProps) * 100)
  const complianceRate = agreements.length > 0
    ? Math.round((agreements.filter((a) => a.complianceFlags.length === 0).length / agreements.length) * 100)
    : 100

  // Monthly payment volume trend
  const monthlyVolumes: Record<string, number> = {}
  for (const p of payments) {
    const month = (p.paidAt ?? '').slice(0, 7)
    if (month) monthlyVolumes[month] = (monthlyVolumes[month] ?? 0) + p.amount
  }

  const months = Object.entries(monthlyVolumes).sort(([a], [b]) => a.localeCompare(b))
  const trend = months.length >= 2
    ? ((months[months.length - 1][1] - months[months.length - 2][1]) / months[months.length - 2][1]) * 100
    : 0

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
  if (!parsed.success) { error(res, parsed.error.errors[0].message); return }

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

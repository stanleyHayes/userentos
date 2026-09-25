import { Router } from 'express'
import { Types } from 'mongoose'
import { authenticate, requireRole } from '../middleware/auth.js'
import { CreditScore } from '../models/CreditScore.js'
import { Payment } from '../models/Payment.js'
import { Agreement } from '../models/Agreement.js'
import { Application } from '../models/Application.js'
import { SavingsPlan } from '../models/SavingsPlan.js'
import { Dispute } from '../models/Dispute.js'
import { AuditLog } from '../models/AuditLog.js'
import { User } from '../models/User.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { hasSignedTenancy, signedTenancyFilter } from '../services/tenancyRelationship.js'

const router = Router()

/**
 * RentOS Credit Score Algorithm v2
 * ================================
 * Total: 0-100 points across 5 weighted factors
 *
 * 1. PAYMENT HISTORY (0-40 pts, 40% weight) — Most critical factor
 *    - Only settled (completed/failed) rent on leases the tenant signed
 *    - Base: (completed / total) * 30 pts
 *    - Bonus: +5 pts for 100% completion rate
 *    - Bonus: +5 pts for 5+ consecutive completed payments
 *    - Penalty: -3 pts per failed payment
 *    - If no payments yet: 20 pts (neutral baseline)
 *
 * 2. SAVINGS CONSISTENCY (0-20 pts, 20% weight)
 *    - Only plans with a target of at least MIN_SCORED_SAVINGS_TARGET
 *    - Has active/completed plans: (avg progress) * 14 pts
 *    - Bonus: +3 pts for any completed plan
 *    - Bonus: +3 pts for 3+ active plans
 *    - No plans: 0 pts
 *
 * 3. AGREEMENT COMPLIANCE (0-20 pts, 20% weight) — tenant-signed leases only
 *    - Base: 15 pts for having an active agreement
 *    - Penalty: -8 pts per violation flag
 *    - Penalty: -3 pts per warning flag
 *    - Bonus: +5 pts for clean record (no flags at all)
 *    - No agreements: 8 pts (neutral)
 *
 * 4. DISPUTE RECORD (0-10 pts, 10% weight)
 *    - Base: 10 pts
 *    - Penalty: -4 pts per open dispute filed by a signed-lease counterparty
 *    - Penalty: -2 pts per escalated dispute
 *    - Bonus: resolved disputes don't count against
 *
 * 5. ACCOUNT AGE & TENURE (0-10 pts, 10% weight)
 *    - 1 pt per month of account age, max 6 pts
 *    - +2 pts if an admin has reviewed the user's ID (verificationStatus)
 *    - +2 pts if 12+ months old
 */

/** Plans below this target (GHS) are too small to evidence saving discipline —
 * a GHS 0.01 goal "completed" instantly used to earn the full savings factor. */
export const MIN_SCORED_SAVINGS_TARGET = 100

async function calculateScore(userId: string) {
  // Only leases the tenant signed count — a landlord's draft must not import
  // its compliance flags, and disputes only count when filed by a party the
  // user actually signed a lease with.
  const tenancies = await Agreement.find(signedTenancyFilter({ $or: [{ tenantId: userId }, { landlordId: userId }] })).lean()
  const agreements = tenancies.filter((a) => a.tenantId === userId)
  const [payments, allPlans, filedAgainst, user] = await Promise.all([
    // Confirmed rent on a signed lease only: own wallet top-ups and
    // subscriptions are not rent, and pending/processing are not outcomes.
    Payment.find({
      tenantId: userId,
      agreementId: { $in: agreements.map((a) => (a._id as Types.ObjectId).toString()) },
      purpose: { $nin: ['wallet_deposit', 'subscription'] },
      status: { $in: ['completed', 'failed'] },
    }).sort({ createdAt: 1 }).lean(),
    SavingsPlan.find({ userId }).lean(),
    Dispute.find({ filedAgainst: userId }).lean(),
    User.findById(userId).lean(),
  ])
  const plans = allPlans.filter((p) => Number(p.targetAmount) >= MIN_SCORED_SAVINGS_TARGET)
  const counterparties = new Set(tenancies.map((a) => `${a.propertyId}:${a.tenantId === userId ? a.landlordId : a.tenantId}`))
  const disputes = filedAgainst.filter((d) => counterparties.has(`${d.propertyId}:${d.filedBy}`))

  // ── 1. Payment History (0-40) ──
  let paymentHistory = 20 // neutral if no payments
  if (payments.length > 0) {
    const completed = payments.filter((p) => p.status === 'completed')
    const failed = payments.filter((p) => p.status === 'failed')
    const completionRate = completed.length / payments.length

    // Base score from completion rate
    paymentHistory = Math.round(completionRate * 30)

    // Bonus for perfect record
    if (completionRate === 1 && completed.length >= 3) paymentHistory += 5

    // Bonus for consecutive payments (check last N)
    let consecutive = 0
    for (let i = payments.length - 1; i >= 0; i--) {
      if (payments[i].status === 'completed') consecutive++
      else break
    }
    if (consecutive >= 5) paymentHistory += 5

    // Penalty for failed payments
    paymentHistory -= failed.length * 3

    paymentHistory = Math.max(0, Math.min(40, paymentHistory))
  }

  // ── 2. Savings Consistency (0-20) ──
  let savingsConsistency = 0
  const activePlans = plans.filter((p) => p.status === 'active' || p.status === 'completed')
  const completedPlans = plans.filter((p) => p.status === 'completed' && Number(p.currentAmount) >= Number(p.targetAmount))
  if (activePlans.length > 0) {
    const avgProgress = activePlans.reduce((s, p) => s + Math.min(1, Math.max(0, Number(p.currentAmount) || 0) / Number(p.targetAmount)), 0) / activePlans.length
    savingsConsistency = Math.round(avgProgress * 14)

    // Bonus for completed plans — only when the target was actually reached
    if (completedPlans.length > 0) savingsConsistency += 3

    // Bonus for diversified savings (3+ plans)
    if (activePlans.length >= 3) savingsConsistency += 3

    savingsConsistency = Math.min(20, savingsConsistency)
  }

  // ── 3. Agreement Compliance (0-20) ──
  let agreementCompliance = 8 // neutral if no agreements
  if (agreements.length > 0) {
    const hasActive = agreements.some((a) => a.status === 'active')
    agreementCompliance = hasActive ? 15 : 8

    const allFlags = agreements.flatMap((a) => a.complianceFlags ?? [])
    const violations = allFlags.filter((f) => f.type === 'violation').length
    const warnings = allFlags.filter((f) => f.type === 'warning').length

    agreementCompliance -= violations * 8
    agreementCompliance -= warnings * 3

    // Clean record bonus
    if (allFlags.length === 0 && hasActive) agreementCompliance += 5

    agreementCompliance = Math.max(0, Math.min(20, agreementCompliance))
  }

  // ── 4. Dispute Record (0-10) ──
  let disputeRecord = 10
  const openDisputes = disputes.filter((d) => d.status !== 'resolved' && d.status !== 'closed')
  const escalated = disputes.filter((d) => d.status === 'escalated')
  disputeRecord -= openDisputes.length * 4
  disputeRecord -= escalated.length * 2
  disputeRecord = Math.max(0, Math.min(10, disputeRecord))

  // ── 5. Account Age & Tenure (0-10) ──
  const createdAt = (user as unknown as { createdAt?: Date })?.createdAt
  const ageMonths = createdAt ? Math.floor((Date.now() - new Date(createdAt).getTime()) / (30 * 24 * 60 * 60 * 1000)) : 0
  let accountAge = Math.min(6, ageMonths) // 1pt per month, max 6
  // There is no email-verification field; the ID review is the account's only verification.
  if ((user as unknown as { verificationStatus?: string })?.verificationStatus === 'verified') accountAge += 2
  if (ageMonths >= 12) accountAge += 2
  accountAge = Math.min(10, accountAge)

  const score = paymentHistory + savingsConsistency + agreementCompliance + disputeRecord + accountAge

  // Build insights for the frontend
  const insights: string[] = []
  if (paymentHistory < 25 && payments.length > 0) insights.push('Your payment completion rate is dragging your score down. Try to avoid missed or failed payments.')
  if (paymentHistory >= 35) insights.push('Excellent payment track record! This is your strongest factor.')
  if (savingsConsistency === 0) insights.push('Start a RentGuard savings plan to boost your score by up to 20 points.')
  if (savingsConsistency >= 15) insights.push('Great savings discipline! Keep your plans on track.')
  if (agreementCompliance < 10 && agreements.length > 0) insights.push('Compliance violations are hurting your score. Resolve any flagged issues.')
  if (disputeRecord < 6) insights.push('Open disputes are affecting your score. Try to resolve them.')
  if (accountAge < 5) insights.push('Your account is still new. Score improves over time as you build history.')

  return {
    score: Math.max(0, Math.min(100, score)),
    factors: { paymentHistory, savingsConsistency, agreementCompliance, disputeRecord, accountAge },
    insights,
    stats: {
      totalPayments: payments.length,
      completedPayments: payments.filter((p) => p.status === 'completed').length,
      failedPayments: payments.filter((p) => p.status === 'failed').length,
      activeSavingsPlans: activePlans.length,
      completedSavingsPlans: completedPlans.length,
      activeAgreements: agreements.filter((a) => a.status === 'active').length,
      totalAgreements: agreements.length,
      openDisputes: openDisputes.length,
      totalDisputes: disputes.length,
      accountAgeMonths: ageMonths,
    },
  }
}

async function upsertScore(userId: string) {
  const calculated = await calculateScore(userId)
  const now = new Date().toISOString()
  const dateKey = now.slice(0, 10) // YYYY-MM-DD

  // Atomic two-step: set the calculated fields + drop today's history entry,
  // then re-push it bounded — no read-modify-write race on the history array.
  await CreditScore.updateOne(
    { userId },
    { $set: { ...calculated, calculatedAt: now }, $pull: { history: { date: dateKey } } },
    { upsert: true },
  )
  const creditScore = await CreditScore.findOneAndUpdate(
    { userId },
    { $push: { history: { $each: [{ score: calculated.score, date: dateKey }], $slice: -90 } } },
    { returnDocument: 'after' },
  ).lean()

  return { ...creditScore, id: (creditScore!._id as Types.ObjectId).toString() }
}

// Get my credit score
router.get('/me', authenticate, async (req, res) => {
  const result = await upsertScore(req.user!.userId)
  success(res, result)
})

const AGGREGATE_ROLES = ['government', 'legal_officer', 'admin', 'super_admin']

// Regulators and legal staff get market-level statistics, never an
// individual's report — there is no lawful basis for browsing scores.
router.get('/aggregate', authenticate, requireRole(...AGGREGATE_ROLES), async (_req, res) => {
  const [summary] = await CreditScore.aggregate<{ count: number; average: number; excellent: number; good: number; fair: number; needsWork: number }>([
    { $group: {
      _id: null,
      count: { $sum: 1 },
      average: { $avg: '$score' },
      excellent: { $sum: { $cond: [{ $gte: ['$score', 80] }, 1, 0] } },
      good: { $sum: { $cond: [{ $and: [{ $gte: ['$score', 60] }, { $lt: ['$score', 80] }] }, 1, 0] } },
      fair: { $sum: { $cond: [{ $and: [{ $gte: ['$score', 40] }, { $lt: ['$score', 60] }] }, 1, 0] } },
      needsWork: { $sum: { $cond: [{ $lt: ['$score', 40] }, 1, 0] } },
    } },
  ])
  success(res, {
    count: summary?.count ?? 0,
    averageScore: summary ? Math.round(summary.average * 10) / 10 : null,
    bands: { excellent: summary?.excellent ?? 0, good: summary?.good ?? 0, fair: summary?.fair ?? 0, needsWork: summary?.needsWork ?? 0 },
  })
})

// Get another user's credit score. Landlords may only view their OWN signed
// tenants or live applicants; admins may view anyone but every read is
// audited first (no audit, no data); government/legal get aggregates only.
router.get('/:userId', authenticate, async (req, res) => {
  const requesterId = req.user!.userId
  const roles = req.user!.roles
  const targetUserId = param(req.params.userId)
  const isAdmin = !req.user!.suspended && (roles.includes('admin') || roles.includes('super_admin'))

  if (targetUserId !== requesterId && !isAdmin) {
    const isLandlord = roles.includes('landlord') || roles.includes('property_manager')
    // A draft the landlord wrote proves nothing — only a lease the tenant
    // signed, or a live application the tenant themselves submitted.
    const related = isLandlord && (
      (await hasSignedTenancy(requesterId, targetUserId)) ||
      (await Application.exists({ landlordId: requesterId, tenantId: targetUserId, status: { $in: ['pending', 'approved'] } }))
    )
    if (!related) {
      error(res, 'You can only view the credit score of your own tenants or applicants', 403); return
    }
  }

  if (!Types.ObjectId.isValid(targetUserId) || !(await User.exists({ _id: targetUserId }))) {
    error(res, 'User not found', 404); return
  }

  if (targetUserId !== requesterId && isAdmin) {
    const reason = typeof req.query.reason === 'string' ? req.query.reason.slice(0, 500) : undefined
    try {
      await AuditLog.create({
        userId: requesterId,
        action: 'credit.score.view',
        entityType: 'CreditScore',
        entityId: targetUserId,
        details: JSON.stringify({ reason: reason ?? null }),
        ipAddress: req.ip,
      })
    } catch {
      error(res, 'Access could not be audited — try again later', 503); return
    }
  }

  const result = await upsertScore(targetUserId)
  success(res, result)
})

export default router

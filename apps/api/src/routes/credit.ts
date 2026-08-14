import { Router } from 'express'
import type { Types } from 'mongoose'
import { authenticate } from '../middleware/auth.js'
import { CreditScore } from '../models/CreditScore.js'
import { Payment } from '../models/Payment.js'
import { Agreement } from '../models/Agreement.js'
import { Application } from '../models/Application.js'
import { SavingsPlan } from '../models/SavingsPlan.js'
import { Dispute } from '../models/Dispute.js'
import { User } from '../models/User.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'

const router = Router()

/**
 * RentOS Credit Score Algorithm v2
 * ================================
 * Total: 0-100 points across 5 weighted factors
 *
 * 1. PAYMENT HISTORY (0-40 pts, 40% weight) — Most critical factor
 *    - Base: (completed / total) * 30 pts
 *    - Bonus: +5 pts for 100% completion rate
 *    - Bonus: +5 pts for 5+ consecutive completed payments
 *    - Penalty: -3 pts per failed payment
 *    - If no payments yet: 20 pts (neutral baseline)
 *
 * 2. SAVINGS CONSISTENCY (0-20 pts, 20% weight)
 *    - Has active/completed plans: (avg progress) * 14 pts
 *    - Bonus: +3 pts for any completed plan
 *    - Bonus: +3 pts for 3+ active plans
 *    - No plans: 0 pts
 *
 * 3. AGREEMENT COMPLIANCE (0-20 pts, 20% weight)
 *    - Base: 15 pts for having an active agreement
 *    - Penalty: -8 pts per violation flag
 *    - Penalty: -3 pts per warning flag
 *    - Bonus: +5 pts for clean record (no flags at all)
 *    - No agreements: 8 pts (neutral)
 *
 * 4. DISPUTE RECORD (0-10 pts, 10% weight)
 *    - Base: 10 pts
 *    - Penalty: -4 pts per open dispute (filed against user)
 *    - Penalty: -2 pts per escalated dispute
 *    - Bonus: resolved disputes don't count against
 *
 * 5. ACCOUNT AGE & TENURE (0-10 pts, 10% weight)
 *    - 1 pt per month of account age, max 6 pts
 *    - +2 pts if user has been verified (emailVerified)
 *    - +2 pts if 12+ months old
 */
async function calculateScore(userId: string) {
  const [payments, agreements, plans, disputes, user] = await Promise.all([
    Payment.find({ tenantId: userId }).sort({ createdAt: 1 }).lean(),
    Agreement.find({ tenantId: userId }).lean(),
    SavingsPlan.find({ userId }).lean(),
    Dispute.find({ filedAgainst: userId }).lean(),
    User.findById(userId).lean(),
  ])

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
  if (activePlans.length > 0) {
    const avgProgress = activePlans.reduce((s, p) => s + Math.min(1, p.currentAmount / Math.max(p.targetAmount, 1)), 0) / activePlans.length
    savingsConsistency = Math.round(avgProgress * 14)

    // Bonus for completed plans
    if (plans.some((p) => p.status === 'completed')) savingsConsistency += 3

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
  if ((user as unknown as { emailVerified?: boolean })?.emailVerified) accountAge += 2
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
      completedSavingsPlans: plans.filter((p) => p.status === 'completed').length,
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

// Get another user's credit score. Staff (government/admin/legal) may view anyone;
// landlords may only view their OWN tenants/applicants. Previously any landlord
// could read — and silently overwrite — any user's score by id (PII IDOR).
router.get('/:userId', authenticate, async (req, res) => {
  const requesterId = req.user!.userId
  const roles = req.user!.roles
  const targetUserId = param(req.params.userId)
  const isStaff = roles.includes('government') || roles.includes('admin') || roles.includes('super_admin') || roles.includes('legal_officer')

  if (!isStaff && targetUserId !== requesterId) {
    const isLandlord = roles.includes('landlord') || roles.includes('property_manager')
    const related = isLandlord && (
      (await Agreement.exists({ landlordId: requesterId, tenantId: targetUserId })) ||
      (await Application.exists({ landlordId: requesterId, tenantId: targetUserId }))
    )
    if (!related) {
      error(res, 'You can only view the credit score of your own tenants or applicants', 403); return
    }
  }

  const result = await upsertScore(targetUserId)
  success(res, result)
})

export default router

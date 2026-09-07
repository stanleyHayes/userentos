/**
 * Affiliate attribution and anti-abuse (spec §11).
 *
 * Commission rules are configurable and snapshotted, so changing terms never
 * rewrites what an affiliate already earned.
 */
import { AffiliateProfile, AffiliateAttribution, AffiliateCommission } from '../../models/Affiliate.js'
import { round2 } from '../../utils/money.js'

/** Attribution window in days; admin-configurable via env. */
export const ATTRIBUTION_WINDOW_DAYS = Number(process.env.AFFILIATE_ATTRIBUTION_DAYS ?? 30)

export interface AttributionInput {
  code: string
  referredUserId?: string
  sessionId?: string
  source?: string
  campaign?: string
}

export interface AttributionResult {
  accepted: boolean
  reason?: string
  affiliateId?: string
}

/**
 * Record a referral touch.
 *
 * Self-referral is rejected outright — the acceptance matrix requires it — as
 * is a repeat attribution for a user who is already attributed, which is how
 * duplicate-account farming shows up.
 */
export async function recordAttribution(input: AttributionInput): Promise<AttributionResult> {
  const code = input.code.trim().toUpperCase()
  const profile = await AffiliateProfile.findOne({ code }).lean()

  if (!profile) return { accepted: false, reason: 'Unknown referral code.' }
  if (profile.status !== 'active') return { accepted: false, reason: 'This affiliate is suspended.' }

  // Self-referral.
  if (input.referredUserId && input.referredUserId === profile.userId) {
    await AffiliateAttribution.create({
      affiliateId: String(profile._id),
      code,
      referredUserId: input.referredUserId,
      sessionId: input.sessionId,
      source: input.source,
      campaign: input.campaign,
      rejectedReason: 'self_referral',
      expiresAt: new Date(Date.now() + ATTRIBUTION_WINDOW_DAYS * 86_400_000),
    })
    return { accepted: false, reason: 'You cannot refer yourself.' }
  }

  // Already attributed: first touch wins, so a second code cannot steal it.
  if (input.referredUserId) {
    const existing = await AffiliateAttribution.findOne({
      referredUserId: input.referredUserId,
      rejectedReason: { $exists: false },
    }).lean()
    if (existing) {
      return { accepted: false, reason: 'This user is already attributed to an affiliate.' }
    }
  }

  const attribution = await AffiliateAttribution.create({
    affiliateId: String(profile._id),
    code,
    referredUserId: input.referredUserId,
    sessionId: input.sessionId,
    source: input.source,
    campaign: input.campaign,
    expiresAt: new Date(Date.now() + ATTRIBUTION_WINDOW_DAYS * 86_400_000),
  })

  return { accepted: true, affiliateId: String(attribution.affiliateId) }
}

export interface CommissionRule { type: 'flat' | 'percentage'; value: number }

/** Create a commission from a rule, snapshotting the rule onto the record. */
export async function createCommission(input: {
  affiliateId: string
  event: 'qualified_signup' | 'subscription' | 'sponsorship' | 'transaction'
  rule: CommissionRule
  baseAmount?: number
  sourceRef?: string
}) {
  const amount = input.rule.type === 'flat'
    ? round2(input.rule.value)
    : round2(((input.baseAmount ?? 0) * input.rule.value) / 100)

  return AffiliateCommission.create({
    affiliateId: input.affiliateId,
    event: input.event,
    sourceRef: input.sourceRef,
    ruleSnapshot: { type: input.rule.type, value: input.rule.value },
    amount,
    status: 'pending',
  })
}

/** Reverse a commission when its source transaction is refunded. */
export async function reverseCommissionsFor(sourceRef: string, reason: string) {
  return AffiliateCommission.updateMany(
    { sourceRef, status: { $in: ['pending', 'approved', 'payable'] } },
    { $set: { status: 'reversed', reason } },
  )
}

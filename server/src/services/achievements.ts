/**
 * Achievement & retention service.
 *
 * Award achievement badges, recompute payment streaks, and dispatch
 * celebration notifications. Designed to be called from natural integration
 * points (payment completion, lease activation, savings goals, etc).
 */

import { Achievement } from '../models/Achievement.js'
import { PaymentStreak } from '../models/PaymentStreak.js'
import { Payment } from '../models/Payment.js'
import { Agreement } from '../models/Agreement.js'
import { SavingsPlan } from '../models/SavingsPlan.js'
import { Property } from '../models/Property.js'
import { ACHIEVEMENT_CATALOG, type AchievementCode, type AchievementDefinition } from '../types/index.js'
import { notify } from './notify.js'

const CATALOG_BY_CODE: Record<string, AchievementDefinition> = ACHIEVEMENT_CATALOG.reduce(
  (acc, def) => ({ ...acc, [def.code]: def }),
  {} as Record<string, AchievementDefinition>,
)

export interface AwardResult {
  awarded: boolean
  alreadyEarned: boolean
  achievement?: {
    id: string
    userId: string
    code: string
    title: string
    description: string
    icon: string
    tier: string
    earnedAt: Date
  }
}

/**
 * Idempotently award an achievement to a user. If they have already earned
 * it (per the unique compound index), this is a no-op. On first award,
 * fires a notification.
 */
export async function awardAchievement(
  userId: string,
  code: AchievementCode,
  metadata: Record<string, unknown> = {},
): Promise<AwardResult> {
  const def = CATALOG_BY_CODE[code]
  if (!def) {
    console.warn(`[Achievements] Unknown code: ${code}`)
    return { awarded: false, alreadyEarned: false }
  }

  // Fast path: skip insert if it already exists
  const existing = await Achievement.findOne({ userId, code }).lean()
  if (existing) {
    return { awarded: false, alreadyEarned: true }
  }

  try {
    const created = await Achievement.create({
      userId,
      code,
      title: def.title,
      description: def.description,
      icon: def.icon,
      tier: def.tier,
      earnedAt: new Date(),
      metadata,
    })

    // Best-effort celebration notification
    try {
      await notify({
        userId,
        title: `Badge unlocked: ${def.title}`,
        message: def.description,
        actionUrl: '/achievements',
        skipEmail: true,
      })
    } catch (err) {
      console.warn('[Achievements] Notification failed:', (err as Error).message)
    }

    return {
      awarded: true,
      alreadyEarned: false,
      achievement: {
        id: created._id.toString(),
        userId: created.userId,
        code: created.code,
        title: created.title,
        description: created.description,
        icon: created.icon,
        tier: created.tier,
        earnedAt: created.earnedAt,
      },
    }
  } catch (err: unknown) {
    // Race condition: another concurrent call inserted first
    const isDuplicate = typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000
    if (isDuplicate) {
      return { awarded: false, alreadyEarned: true }
    }
    throw err
  }
}

function monthKey(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function previousMonthKey(key: string): string {
  const [yStr, mStr] = key.split('-')
  let y = Number(yStr)
  let m = Number(mStr) - 1
  if (m === 0) {
    m = 12
    y -= 1
  }
  return `${y}-${String(m).padStart(2, '0')}`
}

/**
 * Recompute the user's PaymentStreak from completed Payment records and
 * award streak achievements when crossing thresholds.
 */
export async function recomputeStreak(userId: string): Promise<{
  currentStreak: number
  longestStreak: number
  lastPaymentMonth?: string
  awarded: AchievementCode[]
}> {
  const completedPayments = await Payment.find({ tenantId: userId, status: 'completed' })
    .select('paidAt createdAt')
    .lean()

  // Collect unique YYYY-MM keys for completed payments
  const monthSet = new Set<string>()
  for (const p of completedPayments) {
    const dateStr = p.paidAt ?? (p as { createdAt?: string | Date }).createdAt
    if (!dateStr) continue
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) continue
    monthSet.add(monthKey(d))
  }

  const sortedMonths = [...monthSet].sort() // ascending YYYY-MM
  let currentStreak = 0
  let longestStreak = 0
  let streakStartedAt: Date | undefined
  let lastPaymentMonth: string | undefined
  let lastPaymentAt: Date | undefined

  if (sortedMonths.length > 0) {
    lastPaymentMonth = sortedMonths[sortedMonths.length - 1]

    // Walk backwards from latest month, counting consecutive months
    let cursor = lastPaymentMonth
    let count = 0
    for (let i = sortedMonths.length - 1; i >= 0; i--) {
      if (sortedMonths[i] === cursor) {
        count += 1
        cursor = previousMonthKey(cursor)
      } else if (sortedMonths[i] < cursor) {
        // gap — break
        break
      }
    }
    currentStreak = count

    // Longest streak: walk all months and find longest consecutive run
    let runLen = 1
    longestStreak = 1
    for (let i = 1; i < sortedMonths.length; i++) {
      const expected = previousMonthKey(sortedMonths[i])
      if (sortedMonths[i - 1] === expected) {
        runLen += 1
      } else {
        runLen = 1
      }
      if (runLen > longestStreak) longestStreak = runLen
    }

    // streakStartedAt: month at which the current streak began
    if (currentStreak > 0) {
      let started = lastPaymentMonth
      for (let i = 1; i < currentStreak; i++) {
        started = previousMonthKey(started)
      }
      const [sy, sm] = started.split('-')
      streakStartedAt = new Date(Date.UTC(Number(sy), Number(sm) - 1, 1))
    }

    // lastPaymentAt = max paidAt
    for (const p of completedPayments) {
      const dateStr = p.paidAt ?? (p as { createdAt?: string | Date }).createdAt
      if (!dateStr) continue
      const d = new Date(dateStr)
      if (!lastPaymentAt || d.getTime() > lastPaymentAt.getTime()) lastPaymentAt = d
    }
  }

  // Persist
  const existing = await PaymentStreak.findOne({ userId }).lean()
  const breaks: { brokenAt: Date; previousStreak: number; reason?: string }[] = existing?.breaks
    ? existing.breaks.map((b) => ({ brokenAt: b.brokenAt, previousStreak: b.previousStreak, reason: b.reason }))
    : []
  // Detect break: had a previous streak and now currentStreak < previous
  if (existing && existing.currentStreak > 0 && currentStreak < existing.currentStreak) {
    breaks.push({
      brokenAt: new Date(),
      previousStreak: existing.currentStreak,
      reason: 'gap_detected',
    })
  }

  await PaymentStreak.findOneAndUpdate(
    { userId },
    {
      $set: {
        userId,
        currentStreak,
        longestStreak: Math.max(longestStreak, existing?.longestStreak ?? 0),
        lastPaymentMonth,
        lastPaymentAt,
        streakStartedAt,
        breaks,
      },
    },
    { upsert: true, returnDocument: 'after' },
  )

  // Award streak achievements when crossed
  const awarded: AchievementCode[] = []
  const thresholds: { months: number; code: AchievementCode }[] = [
    { months: 3, code: 'on_time_streak_3' },
    { months: 6, code: 'on_time_streak_6' },
    { months: 12, code: 'on_time_streak_12' },
    { months: 24, code: 'on_time_streak_24' },
  ]
  for (const t of thresholds) {
    if (currentStreak >= t.months) {
      const result = await awardAchievement(userId, t.code, { streak: currentStreak })
      if (result.awarded) awarded.push(t.code)
    }
  }

  return { currentStreak, longestStreak: Math.max(longestStreak, existing?.longestStreak ?? 0), lastPaymentMonth, awarded }
}

export type AchievementEvent =
  | 'payment_completed'
  | 'lease_signed'
  | 'savings_goal_hit'
  | 'savings_plan_created'
  | 'profile_verified'
  | 'first_property_listed'
  | 'payroll_payment'
  | 'first_savings_goal'
  | 'loan_settled'

/**
 * Central event router. Call from integration points after a domain event
 * occurs. Best-effort — failures are logged but don't crash the caller.
 */
export async function checkAndAward(
  userId: string,
  eventType: AchievementEvent,
  payload: Record<string, unknown> = {},
): Promise<AchievementCode[]> {
  const awarded: AchievementCode[] = []

  try {
    switch (eventType) {
      case 'payment_completed': {
        const result = await recomputeStreak(userId)
        awarded.push(...result.awarded)
        break
      }

      case 'lease_signed': {
        // Only award first_lease if this is genuinely the user's first active agreement
        const priorActiveCount = await Agreement.countDocuments({
          tenantId: userId,
          status: 'active',
        })
        if (priorActiveCount <= 1) {
          const r = await awardAchievement(userId, 'first_lease', payload)
          if (r.awarded) awarded.push('first_lease')
        }
        break
      }

      case 'savings_goal_hit': {
        const r = await awardAchievement(userId, 'savings_goal_completed', payload)
        if (r.awarded) awarded.push('savings_goal_completed')
        break
      }

      case 'first_savings_goal': {
        const r = await awardAchievement(userId, 'first_savings_goal', payload)
        if (r.awarded) awarded.push('first_savings_goal')
        break
      }

      case 'savings_plan_created': {
        // Award only if this is genuinely the user's first plan
        const priorCount = await SavingsPlan.countDocuments({ userId })
        if (priorCount <= 1) {
          const r = await awardAchievement(userId, 'first_savings_goal', payload)
          if (r.awarded) awarded.push('first_savings_goal')
        }
        break
      }

      case 'profile_verified': {
        const r = await awardAchievement(userId, 'profile_verified', payload)
        if (r.awarded) awarded.push('profile_verified')
        break
      }

      case 'first_property_listed': {
        // Award only if this is genuinely the user's first property
        const priorCount = await Property.countDocuments({ landlordId: userId })
        if (priorCount <= 1) {
          const r = await awardAchievement(userId, 'first_property_listed', payload)
          if (r.awarded) awarded.push('first_property_listed')
        }
        break
      }

      case 'payroll_payment': {
        const r = await awardAchievement(userId, 'rent_paid_via_payroll', payload)
        if (r.awarded) awarded.push('rent_paid_via_payroll')
        // Also recompute streak since this is effectively a payment
        const streak = await recomputeStreak(userId)
        awarded.push(...streak.awarded)
        break
      }

      case 'loan_settled': {
        const r = await awardAchievement(userId, 'loan_settled', payload)
        if (r.awarded) awarded.push('loan_settled')
        break
      }
    }
  } catch (err) {
    console.warn(`[Achievements] checkAndAward(${eventType}) failed:`, (err as Error).message)
  }

  return awarded
}

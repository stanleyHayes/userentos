/**
 * Repeat attempts to take a deal off RentOS (Terms of Service: "Keeping deals
 * on RentOS"). A stopped message is a strike; the screen itself never
 * suspends anyone. The second strike in the window adds a warning to the
 * explanation, and the third puts the account in the admin moderation queue
 * (routes/contentReports.ts), where a person reads the masked attempts and
 * decides whether to suspend.
 */
import { TrustDecision } from '../../models/TrustDecision.js'
import { ContentReport, SYSTEM_REPORTER_ID } from '../../models/ContentReport.js'
import { logger } from '../../utils/logger.js'

export const STRIKE_WINDOW_DAYS = 30
/** From this strike on, the explanation warns about suspension. */
export const WARN_AT = 2
/** From this strike on, the account is in the moderation queue. */
export const REVIEW_AT = 3

export const STRIKE_WARNING = 'Repeated attempts to take deals off RentOS can lead to your account being suspended.'

const windowStart = (now: Date) => new Date(now.getTime() - STRIKE_WINDOW_DAYS * 24 * 60 * 60 * 1000)

/** Enforced blocks in the window, including the one just recorded. */
export async function strikeCount(authorId: string, now = new Date()): Promise<number> {
  return TrustDecision.countDocuments({ authorId, decision: 'BLOCK', enforced: true, 'review.status': { $ne: 'overturned' }, createdAt: { $gte: windowStart(now) } })
}

/**
 * Files, or brings up to date, the one open system report about this account.
 * The report carries masked excerpts only. Never throws.
 */
export async function escalate(authorId: string, strikes: number, now = new Date()): Promise<void> {
  if (strikes < REVIEW_AT) return
  try {
    const recent = await TrustDecision.find({ authorId, decision: 'BLOCK', enforced: true, 'review.status': { $ne: 'overturned' }, createdAt: { $gte: windowStart(now) } })
      .sort({ createdAt: -1 }).limit(5).select('channel reasonCodes maskedExcerpt createdAt').lean()
    const codes = [...new Set(recent.flatMap((d) => d.reasonCodes))].join(', ')
    const details = `Contact protection: ${strikes} messages stopped in the last ${STRIKE_WINDOW_DAYS} days for sharing contact details or moving the deal off RentOS (${codes}). Review the attempts in Admin → Contact protection before deciding.`
    const label = recent.map((d) => `[${d.channel}, ${d.createdAt.toISOString().slice(0, 10)}] ${d.maskedExcerpt}`).join('\n').slice(0, 2000)
    const open = await ContentReport.findOneAndUpdate(
      { reporterId: SYSTEM_REPORTER_ID, targetType: 'user', targetId: authorId, status: { $in: ['open', 'reviewing'] }, reason: 'off_platform_contact' },
      { $set: { details, targetLabel: label } },
    )
    if (open) return
    await ContentReport.create({
      reporterId: SYSTEM_REPORTER_ID,
      targetType: 'user',
      targetId: authorId,
      targetOwnerId: authorId,
      targetLabel: label,
      reason: 'off_platform_contact',
      details,
    })
  } catch (err) {
    // Another open system report about this account (for another reason) holds the one-open-report slot.
    if ((err as { code?: number }).code === 11000) return
    logger.error(`[trust] could not escalate account ${authorId}: ${(err as Error).message}`)
  }
}

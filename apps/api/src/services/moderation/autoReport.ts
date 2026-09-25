/**
 * Automated reports for content the text filter kept but could not clear.
 *
 * A flagged review or message is published, and a report lands in the same
 * admin queue user reports go to, filed by SYSTEM_REPORTER_ID. A human decides;
 * the filter never removes anything on its own for a flag.
 */
import { ContentReport, SYSTEM_REPORTER_ID, type ReportTargetType } from '../../models/ContentReport.js'
import { logger } from '../../utils/logger.js'
import type { FilterVerdict } from './textFilter.js'

/**
 * Whether a flag is worth a moderator's time. Profanity between two people in
 * a private conversation is theirs to have; the same word in a public review
 * is not.
 */
export function shouldReport(verdict: FilterVerdict, visibility: 'public' | 'private'): boolean {
  if (verdict.action !== 'flag') return false
  return visibility === 'public' || verdict.categories.some((c) => c !== 'profanity')
}

export interface FlaggedContent {
  targetType: ReportTargetType
  targetId: string
  ownerId?: string
  label?: string
  verdict: FilterVerdict
}

/** File the report. Never throws: the content is already saved and the author already answered. */
export async function reportFlaggedContent(content: FlaggedContent): Promise<void> {
  if (content.verdict.action === 'allow') return
  try {
    await ContentReport.create({
      reporterId: SYSTEM_REPORTER_ID,
      targetType: content.targetType,
      targetId: content.targetId,
      targetLabel: content.label?.slice(0, 2000),
      targetOwnerId: content.ownerId,
      reason: 'offensive_content',
      details: `Automated filter: ${content.verdict.categories.join(', ')} (${content.verdict.matches.join(', ')})`,
    })
  } catch (err) {
    // An open automated report for this target already exists.
    if ((err as { code?: number }).code === 11000) return
    logger.error(`[moderation] could not file automated report for ${content.targetType} ${content.targetId}: ${(err as Error).message}`)
  }
}

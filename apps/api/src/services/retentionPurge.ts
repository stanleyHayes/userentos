import { Types, type Model } from 'mongoose'
import { purgeRules, retentionCutoff, type RetentionKey } from '../config/retentionSchedule.js'
import { AuditLog } from '../models/AuditLog.js'
import { Application } from '../models/Application.js'
import { Lead } from '../models/Lead.js'
import { Viewing } from '../models/Viewing.js'
import { BusinessInquiry } from '../models/BusinessInquiry.js'
import { ProfileAccess } from '../models/ProfileAccess.js'
import { User } from '../models/User.js'
import { AffiliateProfile, AffiliateCommission } from '../models/Affiliate.js'
import { purgeReplacedAvatars } from './avatarStorage.js'
import { AFFILIATE_CLOSED_REASON, UNPAID_COMMISSION_STATUSES } from './accountErasure.js'
import { recordAuditEntry } from '../utils/audit.js'
import { logger } from '../utils/logger.js'

/**
 * The daily retention purge: every rule in config/retentionSchedule.ts with
 * enforcedBy 'purge' has a handler here (the coverage test checks both ways).
 *
 * Deletes in bounded _id batches so a large first run never holds one huge
 * delete. RETENTION_PURGE_DRY_RUN=true counts what would go and deletes
 * nothing — use it for the first production run and check the counts. Each
 * run writes a counts-only 'retention.purge' audit entry: numbers per rule,
 * never ids or content.
 */
export interface PurgeOptions {
  now?: Date
  dryRun?: boolean
  batchSize?: number
}

export interface RuleOutcome {
  matched: number
  deleted: number
}

type Filter = Record<string, unknown>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = Model<any>
type Handler = (now: Date, options: { dryRun: boolean; batchSize: number }) => Promise<RuleOutcome>

async function purgeInBatches(model: AnyModel, filter: Filter, { dryRun, batchSize }: { dryRun: boolean; batchSize: number }): Promise<RuleOutcome> {
  if (dryRun) return { matched: await model.countDocuments(filter), deleted: 0 }
  const outcome = { matched: 0, deleted: 0 }
  for (;;) {
    const ids = (await model.find(filter).select('_id').sort({ _id: 1 }).limit(batchSize).lean<Array<{ _id: unknown }>>()).map((row) => row._id)
    if (ids.length === 0) return outcome
    outcome.matched += ids.length
    // The filter again, so a row updated since it was read is not deleted.
    const { deletedCount } = await model.deleteMany({ ...filter, _id: { $in: ids } })
    outcome.deleted += deletedCount ?? 0
    if (ids.length < batchSize || !deletedCount) return outcome
  }
}

const cutoff = (key: RetentionKey, now: Date) => retentionCutoff(key, now.getTime())
const OBJECT_ID = /^[a-f0-9]{24}$/i

/**
 * Erasure suspends, rather than deletes, an affiliate profile with commission
 * still unpaid (services/accountErasure.ts), and never runs again for that
 * account. Once the account is gone and nothing is owed, the profile goes.
 */
async function purgeClosedAffiliateProfiles({ dryRun }: { dryRun: boolean }): Promise<RuleOutcome> {
  const suspended = await AffiliateProfile.find({ status: 'suspended', suspendedReason: AFFILIATE_CLOSED_REASON }).select('_id userId').lean()
  if (suspended.length === 0) return { matched: 0, deleted: 0 }
  // The raw collection: the model hides closed accounts' tombstones, which still count as present.
  const userIds = suspended.map((profile) => profile.userId).filter((id) => OBJECT_ID.test(id))
  const present = new Set((await User.collection.distinct('_id', { _id: { $in: userIds.map((id) => new Types.ObjectId(id)) } })).map(String))
  const settled: string[] = []
  for (const profile of suspended.filter((candidate) => !present.has(candidate.userId))) {
    if (!(await AffiliateCommission.exists({ affiliateId: String(profile._id), status: { $in: UNPAID_COMMISSION_STATUSES } }))) settled.push(String(profile._id))
  }
  if (dryRun || settled.length === 0) return { matched: settled.length, deleted: 0 }
  const { deletedCount } = await AffiliateProfile.deleteMany({ _id: { $in: settled }, status: 'suspended', suspendedReason: AFFILIATE_CLOSED_REASON })
  return { matched: settled.length, deleted: deletedCount ?? 0 }
}
const sum = (outcomes: RuleOutcome[]): RuleOutcome => outcomes.reduce((a, b) => ({ matched: a.matched + b.matched, deleted: a.deleted + b.deleted }), { matched: 0, deleted: 0 })

export const PURGE_HANDLERS: Readonly<Record<string, Handler>> = {
  'security.auditLog': (now, options) => purgeInBatches(AuditLog, { createdAt: { $lt: cutoff('auditLog', now) } }, options),
  'applications.unapproved': (now, options) =>
    purgeInBatches(Application, { status: { $ne: 'approved' }, updatedAt: { $lt: cutoff('unapprovedApplication', now) } }, options),
  enquiries: async (now, options) => {
    const filter = { updatedAt: { $lt: cutoff('enquiry', now) } }
    return sum([
      await purgeInBatches(Lead, filter, options),
      await purgeInBatches(Viewing, filter, options),
      await purgeInBatches(BusinessInquiry, filter, options),
    ])
  },
  'profileAccess.closed': (now, options) => {
    const before = cutoff('closedProfileAccess', now)
    return purgeInBatches(ProfileAccess, {
      status: { $in: ['denied', 'revoked'] },
      $or: [{ respondedAt: { $lt: before } }, { respondedAt: { $exists: false }, updatedAt: { $lt: before } }],
    }, options)
  },
  'account.avatar.replaced': (now, options) => purgeReplacedAvatars(cutoff('replacedAvatar', now), options),
  'affiliates.closedProfile': (_now, options) => purgeClosedAffiliateProfiles(options),
}

export const retentionDryRun = () => process.env.RETENTION_PURGE_DRY_RUN === 'true'

export async function runRetentionPurge(options: PurgeOptions = {}): Promise<Record<string, RuleOutcome & { error?: true }>> {
  const now = options.now ?? new Date()
  const dryRun = options.dryRun ?? retentionDryRun()
  const batchSize = options.batchSize ?? 500
  const summary: Record<string, RuleOutcome & { error?: true }> = {}
  for (const rule of purgeRules()) {
    const handler = PURGE_HANDLERS[rule.id]
    if (!handler) throw new Error(`Retention rule ${rule.id} has no purge handler`)
    try {
      summary[rule.id] = await handler(now, { dryRun, batchSize })
    } catch (err) {
      // One failing rule must not stop the others; it retries tomorrow (or on catch-up).
      summary[rule.id] = { matched: 0, deleted: 0, error: true }
      logger.error(`[Retention] Purge for ${rule.id} failed: ${(err as Error).message}`)
    }
  }
  await recordAuditEntry({
    userId: 'system',
    action: 'retention.purge',
    entityType: 'RetentionSchedule',
    entityId: now.toISOString().slice(0, 10),
    details: { dryRun, rules: summary },
  })
  logger.info(`[Retention] Purge ${dryRun ? 'dry run ' : ''}completed`, summary)
  if (Object.values(summary).some((outcome) => outcome.error)) throw new Error('Retention purge incomplete; failed rules retry on the next run')
  return summary
}

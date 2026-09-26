import type { Model } from 'mongoose'
import { User } from '../models/User.js'
import { DocumentModel } from '../models/Document.js'
import { Property } from '../models/Property.js'
import type { IErasureLedger } from '../models/ErasureLedger.js'
import { erasureLedger, markAccountErasureComplete } from './erasureLedger.js'
import { closeAccount, unpublishAccount } from './accountClosure.js'
import { eraseAccountRecords, ACCOUNT_ERASURE_DELAY_MS } from './accountErasure.js'
import { eraseStoredAssets } from './propertyImages.js'
import { erasureLedgerDays } from '../config/retentionSchedule.js'
import { logger } from '../utils/logger.js'

/**
 * Re-apply every erasure in the ledger. Run it against a restored backup
 * before it goes live (docs/compliance/backup-restore.md), and daily inside
 * the retention job so a forgotten step or a half-finished deletion heals
 * itself. Idempotent: an erasure that already holds changes nothing.
 *
 *  - account: an account open again (a restore from before the closure) is
 *    closed with its original request date, then erased if the grace period
 *    has passed. A closed account still in its grace period has its
 *    take-down re-applied. An account that no longer exists marks the entry
 *    complete.
 *  - document / property: records still present are deleted, after their
 *    stored files are erased again ('not found' counts as done). Entries whose
 *    request never finished are completed the same way.
 */
export interface ReplaySummary {
  examined: number
  accountsClosed: number
  accountsErased: number
  accountsRefreshed: number
  recordsDeleted: number
  entriesCompleted: number
  failed: number
}

const PAGE = 200
const MS_PER_DAY = 24 * 60 * 60 * 1000

async function replayAccount(entry: IErasureLedger, now: Date, summary: ReplaySummary): Promise<void> {
  const uid = entry.subjectId
  const cutoff = new Date(now.getTime() - ACCOUNT_ERASURE_DELAY_MS)
  if (await User.exists({ _id: uid })) {
    // Open again: a restore from before the closure, or a closure that failed part-way.
    await closeAccount(uid, { source: 'ledger_replay', actorId: 'system', requestedAt: entry.requestedAt })
    summary.accountsClosed++
    if (await eraseAccountRecords(uid, cutoff)) summary.accountsErased++
    return
  }
  const tombstone = await User.findOne({ _id: uid, deletedAt: { $exists: true } }).select('deletedAt').lean()
  if (tombstone) {
    if (tombstone.deletedAt && tombstone.deletedAt < cutoff) {
      if (await eraseAccountRecords(uid, cutoff)) summary.accountsErased++
    } else {
      await unpublishAccount(uid, entry.requestedAt)
      summary.accountsRefreshed++
    }
    return
  }
  if (!entry.completedAt) {
    await markAccountErasureComplete(uid, now)
    summary.entriesCompleted++
  }
}

async function replayRecords(entry: IErasureLedger, now: Date, summary: ReplaySummary): Promise<void> {
  const model: Model<unknown> = entry.scope === 'document' ? (DocumentModel as unknown as Model<unknown>) : (Property as unknown as Model<unknown>)
  const present = entry.recordIds.length ? await model.countDocuments({ _id: { $in: entry.recordIds } }) : 0
  if (present === 0 && entry.completedAt) return
  await eraseStoredAssets(entry.storageAssets)
  if (present > 0) {
    const deleted = await model.deleteMany({ _id: { $in: entry.recordIds } })
    summary.recordsDeleted += deleted.deletedCount ?? 0
  }
  if (!entry.completedAt) {
    await erasureLedger().updateOne({ _id: entry._id }, { $set: { completedAt: now, expiresAt: new Date(now.getTime() + erasureLedgerDays() * MS_PER_DAY) } })
    summary.entriesCompleted++
  }
}

export async function replayErasureLedger(options: { now?: Date } = {}): Promise<ReplaySummary> {
  const now = options.now ?? new Date()
  const summary: ReplaySummary = { examined: 0, accountsClosed: 0, accountsErased: 0, accountsRefreshed: 0, recordsDeleted: 0, entriesCompleted: 0, failed: 0 }
  let after: { requestedAt: Date; _id: string } | undefined
  for (;;) {
    const page = await erasureLedger()
      .find(after ? { $or: [{ requestedAt: { $gt: after.requestedAt } }, { requestedAt: after.requestedAt, _id: { $gt: after._id } }] } : {})
      .sort({ requestedAt: 1, _id: 1 }).limit(PAGE).lean<IErasureLedger[]>()
    if (page.length === 0) break
    for (const entry of page) {
      summary.examined++
      try {
        if (entry.scope === 'account') await replayAccount(entry, now, summary)
        else await replayRecords(entry, now, summary)
      } catch {
        summary.failed++
        // Ids only — the ledger never holds anything else to log.
        logger.warn(`[Erasure ledger] Replay pending for ${entry.scope} entry ${entry._id}; will retry on the next run`)
      }
      after = { requestedAt: entry.requestedAt, _id: entry._id }
    }
  }
  logger.info('[Erasure ledger] Replay completed', summary)
  return summary
}

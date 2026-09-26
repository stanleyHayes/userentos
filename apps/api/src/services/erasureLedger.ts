import { randomUUID } from 'node:crypto'
import mongoose, { type Connection, type Model } from 'mongoose'
import { erasureLedgerModel, type ErasedStorageAsset, type ErasureScope, type IErasureLedger } from '../models/ErasureLedger.js'
import { erasureLedgerDays } from '../config/retentionSchedule.js'
import { logger } from '../utils/logger.js'

/**
 * The erasure ledger's connection.
 *
 * A snapshot restore rolls back the whole cluster it is taken from, so a
 * ledger stored beside the data it protects is rolled back with it and cannot
 * say what to re-delete. ERASURE_LEDGER_MONGO_URI points it at a separate
 * cluster or project; without it the ledger falls back to the main
 * connection (and the restore runbook has you export it first).
 */
let ledgerConnection: Connection | null = null

export function erasureLedger(): Model<IErasureLedger> {
  const uri = process.env.ERASURE_LEDGER_MONGO_URI
  if (!uri) return erasureLedgerModel()
  ledgerConnection ??= mongoose.createConnection(uri, { serverSelectionTimeoutMS: 10_000 })
  return erasureLedgerModel(ledgerConnection)
}

/** Close the separate ledger connection (scripts, tests, shutdown). */
export async function closeErasureLedger(): Promise<void> {
  const connection = ledgerConnection
  ledgerConnection = null
  if (connection) await connection.close()
}

const hostsOf = (uri: string) => {
  const match = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/.exec(uri)
  return match ? match[1].toLowerCase().split(',').sort().join(',') : uri
}

/** Boot check: say plainly when the ledger would be restored along with the data. */
export function warnIfErasureLedgerShared(mainUri = process.env.MONGO_URI ?? ''): 'separate' | 'shared_cluster' | 'main_connection' {
  const uri = process.env.ERASURE_LEDGER_MONGO_URI
  if (!uri) {
    logger.warn('[Erasure ledger] ERASURE_LEDGER_MONGO_URI is not set, so the erasure ledger is stored in the main database. A cluster restore would roll it back: export the erasureledgers collection before any restore (docs/compliance/backup-restore.md).')
    return 'main_connection'
  }
  if (mainUri && hostsOf(uri) === hostsOf(mainUri)) {
    logger.warn('[Erasure ledger] ERASURE_LEDGER_MONGO_URI points at the same cluster as MONGO_URI. A snapshot restore rolls both back: use a separate cluster, or export the ledger before any restore (docs/compliance/backup-restore.md).')
    return 'shared_cluster'
  }
  return 'separate'
}

export interface ErasureEntry {
  subjectId: string
  scope: ErasureScope
  source: string
  recordIds?: string[]
  storageAssets?: ErasedStorageAsset[]
  requestedAt?: Date
  /** Record deletions finish in the request; account erasure completes at the purge. */
  completed?: boolean
}

const expiryFrom = (completedAt: Date) => new Date(completedAt.getTime() + erasureLedgerDays() * 24 * 60 * 60 * 1000)

/**
 * Record an erasure. Callers await this BEFORE reporting success: a deletion
 * that is not in the ledger cannot be re-applied after a restore. It throws on
 * failure so the request fails rather than silently going unrecorded.
 */
export async function recordErasure(entry: ErasureEntry): Promise<string> {
  const requestedAt = entry.requestedAt ?? new Date()
  const _id = randomUUID()
  await erasureLedger().create({
    _id,
    subjectId: entry.subjectId,
    scope: entry.scope,
    source: entry.source,
    recordIds: entry.recordIds ?? [],
    storageAssets: entry.storageAssets ?? [],
    requestedAt,
    ...(entry.completed ? { completedAt: requestedAt, expiresAt: expiryFrom(requestedAt) } : {}),
  })
  return _id
}

/**
 * Delete one record the user asked to delete, ledger first: the entry, the
 * deletion, then completion. If the deletion fails the entry stays open and
 * the daily replay finishes it.
 */
export async function recordedDeletion(entry: Omit<ErasureEntry, 'completed'>, remove: () => PromiseLike<unknown>): Promise<void> {
  const entryId = await recordErasure(entry)
  await remove()
  await completeErasure(entryId)
}

/** A record deletion finished: start the entry's backup-window countdown. */
export async function completeErasure(entryId: string, at = new Date()): Promise<void> {
  await erasureLedger().updateOne({ _id: entryId, completedAt: { $exists: false } }, { $set: { completedAt: at, expiresAt: expiryFrom(at) } })
}

/** The day-30 purge finished: start the entry's backup-window countdown. */
export async function markAccountErasureComplete(subjectId: string, at = new Date()): Promise<void> {
  await erasureLedger().updateMany(
    { subjectId, scope: 'account', completedAt: { $exists: false } },
    { $set: { completedAt: at, expiresAt: expiryFrom(at) } },
  )
}

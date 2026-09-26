import mongoose, { Schema, type Connection, type Model } from 'mongoose'

/**
 * A record that an erasure happened, kept so it can be re-applied to a
 * restored database backup (docs/compliance/backup-restore.md).
 *
 * Holds identifiers only — the erased account's id, the ids of deleted
 * records and the storage ids of deleted files. Never a name, email or phone:
 * the ledger must not itself become a copy of what was erased.
 *
 * It lives on its own connection (ERASURE_LEDGER_MONGO_URI) so a snapshot
 * restore of the main cluster does not roll it back too; see
 * services/erasureLedger.ts.
 */
export type ErasureScope = 'account' | 'document' | 'property'

export interface ErasedStorageAsset {
  publicId: string
  resourceType: 'image' | 'video' | 'raw'
  /** Cloudinary delivery type; evidence files are 'authenticated'. */
  deliveryType?: 'upload' | 'authenticated'
}

export interface IErasureLedger {
  _id: string
  /** The account the erasure concerns (User _id). */
  subjectId: string
  scope: ErasureScope
  /** Ids of the deleted records (Document / Property ids). */
  recordIds: string[]
  storageAssets: ErasedStorageAsset[]
  /** Who asked: self_service, admin, email_request, owner (record deletes). */
  source: string
  requestedAt: Date
  /** When every step finished; account entries complete at the day-30 purge. */
  completedAt?: Date
  /** completedAt + backup window + margin; the TTL index removes the entry then. */
  expiresAt?: Date
}

export const erasureLedgerSchema = new Schema<IErasureLedger>({
  _id: { type: String, required: true },
  subjectId: { type: String, required: true },
  scope: { type: String, required: true, enum: ['account', 'document', 'property'] },
  recordIds: { type: [String], default: [] },
  storageAssets: {
    type: [{
      _id: false,
      publicId: { type: String, required: true },
      resourceType: { type: String, required: true, enum: ['image', 'video', 'raw'] },
      deliveryType: { type: String, enum: ['upload', 'authenticated'] },
    }],
    default: [],
  },
  source: { type: String, required: true },
  requestedAt: { type: Date, required: true },
  completedAt: Date,
  expiresAt: Date,
}, { versionKey: false, collection: 'erasureledgers' })

erasureLedgerSchema.index({ subjectId: 1, scope: 1 })
erasureLedgerSchema.index({ requestedAt: 1, _id: 1 })
// Entries without expiresAt (erasure still pending) are never removed.
erasureLedgerSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

/** The ledger model bound to `connection` (the default connection when omitted). */
export function erasureLedgerModel(connection?: Connection): Model<IErasureLedger> {
  if (!connection) {
    return (mongoose.models.ErasureLedger as Model<IErasureLedger>) ?? mongoose.model<IErasureLedger>('ErasureLedger', erasureLedgerSchema)
  }
  return (connection.models.ErasureLedger as Model<IErasureLedger>) ?? connection.model<IErasureLedger>('ErasureLedger', erasureLedgerSchema)
}

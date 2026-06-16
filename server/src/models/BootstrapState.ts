import mongoose, { Schema, type Document } from 'mongoose'

export interface IBootstrapState extends Document {
  key: string
  ranAt: string
}

const bootstrapStateSchema = new Schema<IBootstrapState>({
  key: { type: String, required: true, unique: true, index: true },
  ranAt: { type: String, required: true },
})

export const BootstrapState = mongoose.model<IBootstrapState>('BootstrapState', bootstrapStateSchema)

/**
 * Atomically claim a bootstrap key. Returns true if this caller should run
 * the corresponding bootstrap step, false if another instance already did.
 *
 * Uses findOneAndUpdate with upsert + setOnInsert. When the document is
 * newly inserted, `lastErrorObject.updatedExisting` is false (we own the
 * lock). When it already existed, it's true (skip).
 */
export async function claimBootstrap(key: string): Promise<boolean> {
  const now = new Date().toISOString()
  const result = await BootstrapState.findOneAndUpdate(
    { key },
    { $setOnInsert: { key, ranAt: now } },
    { upsert: true, returnDocument: 'before', includeResultMetadata: true },
  )
  // includeResultMetadata returns ModifyResult: { value, lastErrorObject, ok }.
  // updatedExisting === false means we just inserted, i.e. we won the race.
  const updatedExisting =
    (result as unknown as { lastErrorObject?: { updatedExisting?: boolean } })
      ?.lastErrorObject?.updatedExisting
  return updatedExisting === false
}

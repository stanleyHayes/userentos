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

/**
 * Roll back a bootstrap claim after its step failed. Without this the marker
 * written by claimBootstrap persists and every future boot skips the step,
 * leaving a permanently half-seeded database.
 */
export async function releaseBootstrap(key: string): Promise<void> {
  await BootstrapState.deleteOne({ key })
}

/**
 * Claim `key` and run `step`. If the step throws, the claim is rolled back so
 * the next boot retries; the error is rethrown so startup still fails loudly.
 * Returns true if the step ran, false if it already ran on this database.
 */
export async function runBootstrap(key: string, step: () => Promise<void>): Promise<boolean> {
  if (!(await claimBootstrap(key))) return false
  try {
    await step()
  } catch (err) {
    await releaseBootstrap(key)
    throw err
  }
  return true
}

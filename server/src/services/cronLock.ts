import mongoose from 'mongoose'

/**
 * Distributed cron lock.
 *
 * In a horizontally-scaled deployment every instance runs its own node-cron
 * scheduler, so a job like auto-debit would otherwise fire once PER INSTANCE and
 * double-charge. `acquireCronLock` lets exactly one instance claim a job for a TTL
 * window via an atomic upsert; the others skip that tick. The lock auto-expires
 * (no explicit release needed), so a crashed holder doesn't wedge the job forever.
 */
const cronLockSchema = new mongoose.Schema(
  {
    _id: { type: String },            // job name
    lockedUntil: { type: Date, required: true },
  },
  { versionKey: false },
)

const CronLock =
  (mongoose.models.CronLock as mongoose.Model<{ _id: string; lockedUntil: Date }>) ||
  mongoose.model<{ _id: string; lockedUntil: Date }>('CronLock', cronLockSchema)

/**
 * Try to claim `job` for `ttlMs`. Returns true iff this instance acquired it.
 *
 * Canonical TTL-lock via upsert: the filter only matches when no live lock exists
 * (expired or absent). If another instance holds a live lock, the upsert attempts an
 * insert on an existing _id and Mongo throws a duplicate-key error (11000) → not
 * acquired. Any other error is treated as "not acquired" so a lock failure never
 * causes a job to run unguarded.
 */
export async function acquireCronLock(job: string, ttlMs: number): Promise<boolean> {
  const now = new Date()
  try {
    await CronLock.findOneAndUpdate(
      { _id: job, lockedUntil: { $lte: now } },
      { $set: { lockedUntil: new Date(now.getTime() + ttlMs) } },
      { upsert: true },
    )
    return true
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return false // another instance holds it
    return false
  }
}

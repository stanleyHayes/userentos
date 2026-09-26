import mongoose, { Schema, type Model } from 'mongoose'

/**
 * When each daily job last ran and last succeeded.
 *
 * The scheduler runs inside the web process, and a sleeping instance (Render
 * free plan) misses its 03:00/04:00 ticks entirely. services/jobRuns.ts reads
 * lastSuccessAt at boot and every hour, and runs any daily job that has not
 * succeeded in the last day, so retention and erasure catch up on wake.
 */
export interface IJobRun {
  _id: string
  lastStartedAt?: Date
  lastSuccessAt?: Date
  lastFailureAt?: Date
  lastError?: string
}

const jobRunSchema = new Schema<IJobRun>({
  _id: { type: String, required: true },
  lastStartedAt: Date,
  lastSuccessAt: Date,
  lastFailureAt: Date,
  lastError: String,
}, { versionKey: false })

export const JobRun = (mongoose.models.JobRun as Model<IJobRun>) ?? mongoose.model<IJobRun>('JobRun', jobRunSchema)

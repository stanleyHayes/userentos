import { JobRun } from '../models/JobRun.js'
import { acquireCronLock } from './cronLock.js'
import { logger } from '../utils/logger.js'

/**
 * Daily jobs that must not silently skip a day.
 *
 * node-cron only fires while the process is awake. On a host that sleeps
 * when idle (Render's free plan) the 03:00 and 04:00 ticks can pass with no
 * process to run them, night after night. Each run records lastSuccessAt in
 * JobRun; catchUpDailyJobs runs any job whose last success is more than a day
 * old — shortly after boot and then hourly — still under the cron lock, so
 * several instances never run it twice.
 */
export interface DailyJob {
  name: string
  lockTtlMs: number
  run: () => Promise<unknown>
}

export type JobOutcome = 'ran' | 'locked' | 'failed' | 'fresh'

export const DAY_MS = 24 * 60 * 60 * 1000

/** Run one daily job under its lock and record the outcome. Never rejects. */
export async function runDailyJob(job: DailyJob, now = new Date()): Promise<JobOutcome> {
  try {
    if (!(await acquireCronLock(job.name, job.lockTtlMs))) return 'locked'
    await JobRun.updateOne({ _id: job.name }, { $set: { lastStartedAt: now } }, { upsert: true })
    await job.run()
    await JobRun.updateOne({ _id: job.name }, { $set: { lastSuccessAt: new Date() }, $unset: { lastError: 1 } })
    return 'ran'
  } catch (err) {
    logger.error(`[Scheduler] ${job.name} failed; it will be retried: ${(err as Error).message}`)
    await JobRun.updateOne(
      { _id: job.name },
      { $set: { lastFailureAt: new Date(), lastError: (err as Error).message.slice(0, 300) } },
      { upsert: true },
    ).catch(() => undefined)
    return 'failed'
  }
}

export async function jobIsOverdue(name: string, now = new Date(), maxAgeMs = DAY_MS): Promise<boolean> {
  const run = await JobRun.findById(name).select('lastSuccessAt').lean()
  return !run?.lastSuccessAt || now.getTime() - new Date(run.lastSuccessAt).getTime() > maxAgeMs
}

/** Run every job that has not succeeded within a day. Never rejects. */
export async function catchUpDailyJobs(jobs: readonly DailyJob[], now = new Date()): Promise<Record<string, JobOutcome>> {
  const outcomes: Record<string, JobOutcome> = {}
  for (const job of jobs) {
    try {
      outcomes[job.name] = (await jobIsOverdue(job.name, now)) ? await runDailyJob(job, now) : 'fresh'
    } catch (err) {
      logger.error(`[Scheduler] Catch-up check for ${job.name} failed: ${(err as Error).message}`)
      outcomes[job.name] = 'failed'
    }
  }
  if (Object.values(outcomes).some((outcome) => outcome === 'ran')) logger.info('[Scheduler] Caught up missed daily jobs', outcomes)
  return outcomes
}

import cron from 'node-cron'
import { runRetentionPurge } from './retentionPurge.js'
import { purgeExpiredAccounts } from './accountErasure.js'
import { replayErasureLedger } from './erasureReplay.js'
import { runDailyJob, catchUpDailyJobs, type DailyJob } from './jobRuns.js'
import { logger } from '../utils/logger.js'

const LOCK_TTL_DAILY = 2 * 60 * 60 * 1000

/**
 * The daily data-retention jobs:
 *  - retention-purge (03:00): every 'purge' rule in the retention schedule,
 *    the audit log's two years included.
 *  - gdpr-delete (04:00): re-apply the erasure ledger, then erase closed
 *    accounts whose grace period has passed.
 */
export const RETENTION_JOBS: readonly DailyJob[] = [
  { name: 'retention-purge', lockTtlMs: LOCK_TTL_DAILY, run: () => runRetentionPurge() },
  {
    name: 'gdpr-delete',
    lockTtlMs: LOCK_TTL_DAILY,
    run: async () => {
      // In turn (both may erase the same account), and both run even if the
      // first fails; the job only counts as done when both did.
      const replayed = await replayErasureLedger().then(() => true, () => false)
      const erased = await purgeExpiredAccounts().then(() => true, () => false)
      if (!replayed || !erased) throw new Error('Erasure run incomplete')
    },
  },
]

const CATCH_UP_DELAY_MS = 60 * 1000

export function scheduleRetentionJobs(timezone: string): void {
  const [purge, erasure] = RETENTION_JOBS
  cron.schedule('0 3 * * *', () => { void runDailyJob(purge) }, { timezone })
  cron.schedule('0 4 * * *', () => { void runDailyJob(erasure) }, { timezone })
  // A sleeping instance misses the nightly ticks: catch up soon after it
  // wakes, and re-check hourly (which also retries a failed run).
  setTimeout(() => { void catchUpDailyJobs(RETENTION_JOBS) }, CATCH_UP_DELAY_MS).unref()
  cron.schedule('17 * * * *', () => { void catchUpDailyJobs(RETENTION_JOBS) }, { timezone })
  logger.info('[Scheduler] Retention purge at 3am, erasure and ledger replay at 4am Ghana time, with hourly catch-up.')
}

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }))
vi.mock('../models/JobRun.js', () => ({ JobRun: { findById: vi.fn(), updateOne: vi.fn().mockResolvedValue({}) } }))
vi.mock('../services/cronLock.js', () => ({ acquireCronLock: vi.fn().mockResolvedValue(true) }))
vi.mock('../services/retentionPurge.js', () => ({ runRetentionPurge: vi.fn().mockResolvedValue({}) }))
vi.mock('../services/accountErasure.js', () => ({ purgeExpiredAccounts: vi.fn().mockResolvedValue({ removed: 0, failed: 0, skipped: 0 }) }))
vi.mock('../services/erasureReplay.js', () => ({ replayErasureLedger: vi.fn().mockResolvedValue({ failed: 0 }) }))
vi.mock('../utils/logger.js', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))

const { JobRun } = await import('../models/JobRun.js')
const { acquireCronLock } = await import('../services/cronLock.js')
const { runRetentionPurge } = await import('../services/retentionPurge.js')
const { purgeExpiredAccounts } = await import('../services/accountErasure.js')
const { replayErasureLedger } = await import('../services/erasureReplay.js')
const { catchUpDailyJobs, runDailyJob } = await import('../services/jobRuns.js')
const { RETENTION_JOBS } = await import('../services/retentionJobs.js')

const NOW = new Date('2026-09-26T12:00:00Z')
const lastSuccess = (hoursAgo: number | null) => {
  vi.mocked(JobRun.findById).mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(hoursAgo === null ? null : { lastSuccessAt: new Date(NOW.getTime() - hoursAgo * 3600_000) }) }),
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(acquireCronLock).mockResolvedValue(true)
})

describe('daily retention jobs catch up after the instance slept through them', () => {
  it('runs the purge, the ledger replay and account erasure once when the last success is 30 hours old', async () => {
    lastSuccess(30)
    const outcomes = await catchUpDailyJobs(RETENTION_JOBS, NOW)
    expect(outcomes).toEqual({ 'retention-purge': 'ran', 'gdpr-delete': 'ran' })
    expect(runRetentionPurge).toHaveBeenCalledTimes(1)
    expect(replayErasureLedger).toHaveBeenCalledTimes(1)
    expect(purgeExpiredAccounts).toHaveBeenCalledTimes(1)
    expect(JobRun.updateOne).toHaveBeenCalledWith({ _id: 'retention-purge' }, { $set: { lastSuccessAt: expect.any(Date) }, $unset: { lastError: 1 } })
  })

  it('leaves jobs alone that succeeded 2 hours ago', async () => {
    lastSuccess(2)
    expect(await catchUpDailyJobs(RETENTION_JOBS, NOW)).toEqual({ 'retention-purge': 'fresh', 'gdpr-delete': 'fresh' })
    expect(runRetentionPurge).not.toHaveBeenCalled()
    expect(purgeExpiredAccounts).not.toHaveBeenCalled()
  })

  it('runs a job that has never succeeded, but not while another instance holds its lock', async () => {
    lastSuccess(null)
    vi.mocked(acquireCronLock).mockResolvedValue(false)
    expect(await catchUpDailyJobs(RETENTION_JOBS, NOW)).toEqual({ 'retention-purge': 'locked', 'gdpr-delete': 'locked' })
    expect(runRetentionPurge).not.toHaveBeenCalled()
  })

  it('records a failure without a success, so the next hourly check retries it', async () => {
    vi.mocked(runRetentionPurge).mockRejectedValueOnce(new Error('database unavailable'))
    expect(await runDailyJob(RETENTION_JOBS[0], NOW)).toBe('failed')
    expect(JobRun.updateOne).not.toHaveBeenCalledWith({ _id: 'retention-purge' }, expect.objectContaining({ $set: { lastSuccessAt: expect.any(Date) } }))
    expect(JobRun.updateOne).toHaveBeenCalledWith({ _id: 'retention-purge' }, { $set: { lastFailureAt: expect.any(Date), lastError: 'database unavailable' } }, { upsert: true })
  })

  it('still erases accounts when the ledger replay fails, but does not count the run as done', async () => {
    vi.mocked(replayErasureLedger).mockRejectedValueOnce(new Error('ledger unavailable'))
    expect(await runDailyJob(RETENTION_JOBS[1], NOW)).toBe('failed')
    expect(purgeExpiredAccounts).toHaveBeenCalledTimes(1)
  })
})

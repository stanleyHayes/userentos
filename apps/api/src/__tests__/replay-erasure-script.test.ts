import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/erasureReplay.js', () => ({ replayErasureLedger: vi.fn() }))
vi.mock('../services/retentionPurge.js', () => ({ runRetentionPurge: vi.fn() }))

const { replayErasureLedger } = await import('../services/erasureReplay.js')
const { runRetentionPurge } = await import('../services/retentionPurge.js')
const { restoreTarget, replayOntoConnectedDatabase } = await import('../scripts/replayErasureLedger.js')

const clean = { examined: 3, accountsClosed: 0, accountsErased: 0, accountsRefreshed: 0, recordsDeleted: 1, entriesCompleted: 0, failed: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(replayErasureLedger).mockResolvedValue(clean)
  vi.mocked(runRetentionPurge).mockResolvedValue({ enquiries: { matched: 2, deleted: 2 } })
})

describe('replaying erasures onto a restored backup', () => {
  it('takes the restored copy from RESTORE_MONGO_URI or a --mongo-uri flag, never from MONGO_URI', () => {
    expect(restoreTarget(['node', 'replay.js'], { RESTORE_MONGO_URI: 'mongodb://restored/rentos' })).toBe('mongodb://restored/rentos')
    expect(restoreTarget(['node', 'replay.js', '--mongo-uri=mongodb://flag/rentos'], { RESTORE_MONGO_URI: 'mongodb://restored/rentos' })).toBe('mongodb://flag/rentos')
    expect(restoreTarget(['node', 'replay.js'], { MONGO_URI: 'mongodb://live/rentos' })).toBeNull()
  })

  it('leaves the hosting provider alone on a restored copy, and re-runs the retention purge', async () => {
    const result = await replayOntoConnectedDatabase(true)
    expect(replayErasureLedger).toHaveBeenCalledWith({ contactHost: false })
    expect(runRetentionPurge).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ target: 'restored copy', ok: true, purge: { failed: false, rules: { enquiries: { deleted: 2 } } } })
  })

  it('calls the host as the daily job does when run against the live database', async () => {
    await replayOntoConnectedDatabase(false)
    expect(replayErasureLedger).toHaveBeenCalledWith({ contactHost: true })
  })

  it('fails while a purge rule failed, even when every ledger entry held', async () => {
    vi.mocked(runRetentionPurge).mockRejectedValueOnce(new Error('Retention purge incomplete'))
    expect(await replayOntoConnectedDatabase(true)).toMatchObject({ ok: false, purge: { failed: true } })
  })
})

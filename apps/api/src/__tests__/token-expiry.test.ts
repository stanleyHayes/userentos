import { afterEach, expect, it, vi } from 'vitest'
import { scheduleTokenExpiry } from '../services/tokenExpiry.js'
afterEach(() => vi.useRealTimers())
it('expires at the absolute deadline and cancellation prevents later expiry', () => {
  vi.useFakeTimers(); vi.setSystemTime(1000)
  const expired = vi.fn(), canceled = vi.fn()
  scheduleTokenExpiry(1500, expired)
  const stop = scheduleTokenExpiry(1600, canceled)
  stop()
  vi.advanceTimersByTime(499); expect(expired).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1); expect(expired).toHaveBeenCalledOnce()
  vi.advanceTimersByTime(100); expect(canceled).not.toHaveBeenCalled()
})
it('does not overflow or expire early for deadlines beyond the timer limit', () => {
  vi.useFakeTimers(); vi.setSystemTime(0)
  const expired = vi.fn()
  scheduleTokenExpiry(2_147_483_647 + 1000, expired)
  vi.advanceTimersByTime(2_147_483_647); expect(expired).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1000); expect(expired).toHaveBeenCalledOnce()
})

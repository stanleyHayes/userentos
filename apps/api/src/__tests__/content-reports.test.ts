import { describe, it, expect } from 'vitest'
import {
  checkReportVelocity,
  canResolveReport,
  statusForAction,
} from '../services/contentReports.js'

const NOW = new Date('2026-09-07T12:00:00Z')
/** `minutes` ago, relative to NOW. */
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000)

describe('report velocity limit (spec §15)', () => {
  it('allows a reporter under the limit', () => {
    expect(checkReportVelocity([ago(5), ago(10)], NOW, 5).allowed).toBe(true)
  })

  it('allows a reporter with no history at all', () => {
    expect(checkReportVelocity([], NOW, 5).allowed).toBe(true)
  })

  it('blocks once the limit is reached inside the window', () => {
    const result = checkReportVelocity([ago(1), ago(2), ago(3)], NOW, 3)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('3 reports')
  })

  it('ignores reports that have aged out of the window', () => {
    // Three reports, but two are over an hour old, so only one counts.
    const result = checkReportVelocity([ago(90), ago(75), ago(10)], NOW, 3)
    expect(result.allowed).toBe(true)
  })

  it('tells a blocked reporter when the window frees up', () => {
    // The oldest in-window report was 50 minutes ago, so 10 minutes remain.
    const result = checkReportVelocity([ago(50), ago(20), ago(1)], NOW, 3)
    expect(result.allowed).toBe(false)
    expect(result.retryAfterMinutes).toBe(10)
  })

  it('never reports a retry of zero, which would read as "try now" to a client', () => {
    // An exactly-expiring report rounds up rather than down.
    const result = checkReportVelocity([ago(59.99), ago(2), ago(1)], NOW, 3)
    expect(result.retryAfterMinutes).toBeGreaterThanOrEqual(1)
  })
})

describe('report resolution rules (spec §6)', () => {
  it('lets an open or claimed report be resolved', () => {
    expect(canResolveReport('open').ok).toBe(true)
    expect(canResolveReport('reviewing').ok).toBe(true)
  })

  it('refuses to re-resolve a finished report, naming its state', () => {
    for (const status of ['actioned', 'dismissed']) {
      const result = canResolveReport(status)
      expect(result.ok, `${status} must be terminal`).toBe(false)
      expect(result.reason).toContain(status)
    }
  })

  it('treats "no action" as a dismissal and everything else as actioned', () => {
    expect(statusForAction('none')).toBe('dismissed')
    expect(statusForAction('warned')).toBe('actioned')
    expect(statusForAction('content_removed')).toBe('actioned')
  })
})

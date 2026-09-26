/**
 * Retention periods the privacy notices quote, for the web and mobile apps.
 *
 * The numbers are defined in ./types/index.ts (RETENTION_PERIOD_DAYS) because
 * the API compiles only its synced copy of that file: the API's retention
 * schedule enforces the same values the notice prints, and its coverage test
 * fails if they ever differ.
 */
export { RETENTION_PERIOD_DAYS } from './types/index'

/** "30 days", "1 year", "2 years", "13 months" — how the notice words a period. */
export function describeRetentionDays(days: number): string {
  if (days % 365 === 0) return days === 365 ? '1 year' : `${days / 365} years`
  if (days === 395) return '13 months'
  return `${days} days`
}

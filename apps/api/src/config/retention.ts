/**
 * Retention periods now live in config/retentionSchedule.ts, the full
 * classification of every collection. This module keeps the original imports
 * (models' TTL indexes, the scheduler) working unchanged.
 */
export { RETENTION_DAYS, ttlSeconds, retentionCutoff } from './retentionSchedule.js'
export type { RetentionKey } from './retentionSchedule.js'

/**
 * Money that needs a human.
 *
 * Some outcomes are correct to record but wrong to leave unseen: a charge that
 * succeeded after we marked it failed, a buyer charged twice for one order, a
 * provider refund the landlord has already withdrawn. Each is logged, sent to
 * Sentry (a no-op when SENTRY_DSN is unset) and written to the audit log as
 * `alert.<code>`, which the admin audit viewer filters on. Never throws: the
 * financial write it describes has already happened.
 */
import * as Sentry from '@sentry/node'
import { AuditLog } from '../../models/AuditLog.js'
import { logger } from '../../utils/logger.js'

export function financialAlert(code: string, entity: { type: string; id: string }, details: Record<string, unknown> = {}): void {
  logger.error(`[FinancialAlert] ${code} on ${entity.type} ${entity.id}`, details)
  try {
    Sentry.captureMessage(`financial.${code}`, { level: 'warning', tags: { alert: code, entityType: entity.type }, extra: { entityId: entity.id, ...details } })
  } catch { /* alerting must never break the caller */ }
  try {
    AuditLog.create({ userId: 'system', action: `alert.${code}`, entityType: entity.type, entityId: entity.id, details: JSON.stringify(details) })
      .catch((err: Error) => logger.warn(`[FinancialAlert] audit write failed: ${err.message}`))
  } catch { /* a mocked or unavailable audit log is not the caller's problem */ }
}

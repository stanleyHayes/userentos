import type { Request } from 'express'
import { AuditLog } from '../models/AuditLog.js'
import { logger } from './logger.js'

/**
 * Best-effort audit trail writer. A failed audit write must never break the
 * request it annotates, so errors are logged and swallowed.
 */
export async function recordAudit(
  req: Request,
  action: string,
  entityType: string,
  entityId: string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await AuditLog.create({
      userId: req.user?.userId ?? 'system',
      action,
      entityType,
      entityId,
      details: details ? JSON.stringify(details) : undefined,
      ipAddress: req.ip,
    })
  } catch (err) {
    logger.warn(`[audit] failed to record ${action}:`, (err as Error).message)
  }
}

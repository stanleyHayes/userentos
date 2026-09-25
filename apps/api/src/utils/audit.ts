import type { Request } from 'express'
import { AuditLog } from '../models/AuditLog.js'
import { logger } from './logger.js'

export interface AuditEntry {
  /** Who acted — the account, or 'anonymous'/'system' when there is none. */
  userId: string
  action: string
  entityType: string
  entityId: string
  details?: Record<string, unknown>
  ipAddress?: string
}

/**
 * Best-effort audit trail writer for code that has no request object (e.g.
 * services acting for a user who is not yet authenticated — login, password
 * reset). A failed audit write must never break the operation it annotates,
 * so errors are logged and swallowed; this never rejects.
 */
export async function recordAuditEntry(entry: AuditEntry): Promise<void> {
  try {
    await AuditLog.create({
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      details: entry.details ? JSON.stringify(entry.details) : undefined,
      ipAddress: entry.ipAddress,
    })
  } catch (err) {
    logger.warn(`[audit] failed to record ${entry.action}:`, (err as Error).message)
  }
}

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
  return recordAuditEntry({ userId: req.user?.userId ?? 'system', action, entityType, entityId, details, ipAddress: req.ip })
}

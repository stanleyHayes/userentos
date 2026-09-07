/**
 * Admin audit-log reader.
 *
 * Almost every writer in the system funnels through recordAudit (utils/audit.ts);
 * a few routes and services call AuditLog.create directly. Neither the action
 * nor the entityType vocabulary is fixed: actions range from bare verbs written
 * by the document routes ('upload', 'update', 'delete') to dotted names like
 * 'storefront.domain_verified', and entityType is 'document' in one place and
 * 'Payment' in another. Hardcoding either list here would go stale the moment
 * someone adds a route, so the filter dropdowns are fed from the data itself.
 */

import { Router } from 'express'
import { isValidObjectId, type Types } from 'mongoose'
import { authenticate, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { AuditLog } from '../models/AuditLog.js'
import { User } from '../models/User.js'
import { success } from '../utils/response.js'

const router = Router()

// Reading the audit trail is admin-only. Deliberately NOT audited itself:
// logging every list view would flood the collection being listed and pollute
// the very vocabulary this endpoint reports.
router.use(authenticate, requireRole('admin', 'super_admin'))

export const AUDIT_LOG_DEFAULT_LIMIT = 25
/** A page any larger stops being a table and starts being an export. */
export const AUDIT_LOG_MAX_LIMIT = 100

export interface AuditLogFilter {
  userId?: string
  action?: string
  entityType?: string
  createdAt?: { $gte?: Date; $lte?: Date }
}

export interface AuditLogQueryPlan {
  filter: AuditLogFilter
  page: number
  limit: number
  skip: number
}

interface AuditLogRow {
  _id: Types.ObjectId
  userId: string
  action: string
  entityType: string
  entityId: string
  details?: string
  ipAddress?: string
  createdAt: Date
}

/** Express 5 hands back string | string[] for a repeated key; take the first. */
function firstString(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Turn a date bound into the instant a human means by it.
 *
 * A bare 'YYYY-MM-DD' parses as midnight UTC, so using it verbatim as the
 * upper bound would silently drop everything that happened on the last day of
 * the range — the single most confusing thing a date filter can do. A date-only
 * bound is therefore widened to the far edge of that day; a full timestamp is
 * taken exactly as given. Both bounds are inclusive.
 */
function parseBound(raw: string | undefined, edge: 'start' | 'end'): Date | undefined {
  if (raw === undefined) return undefined
  const iso = DATE_ONLY.test(raw)
    ? `${raw}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`
    : raw
  const ms = Date.parse(iso)
  // A typo in a bookmarked URL should show the unfiltered log, not a 400.
  return Number.isNaN(ms) ? undefined : new Date(ms)
}

function parseCount(value: unknown, fallback: number, min: number, max: number): number {
  const raw = firstString(value)
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(Math.trunc(parsed), min), max)
}

/**
 * Build the Mongo filter and pagination window from raw query params.
 *
 * Pure and total: an absent param means "no constraint" rather than a match
 * against undefined, and an unparseable value is dropped rather than thrown.
 */
export function buildAuditLogFilter(query: Record<string, unknown>): AuditLogQueryPlan {
  const filter: AuditLogFilter = {}

  const userId = firstString(query.userId)
  if (userId !== undefined) filter.userId = userId
  const action = firstString(query.action)
  if (action !== undefined) filter.action = action
  const entityType = firstString(query.entityType)
  if (entityType !== undefined) filter.entityType = entityType

  const from = parseBound(firstString(query.from), 'start')
  const to = parseBound(firstString(query.to), 'end')
  if (from || to) {
    filter.createdAt = {}
    if (from) filter.createdAt.$gte = from
    if (to) filter.createdAt.$lte = to
  }

  const page = parseCount(query.page, 1, 1, Number.MAX_SAFE_INTEGER)
  const limit = parseCount(query.limit, AUDIT_LOG_DEFAULT_LIMIT, 1, AUDIT_LOG_MAX_LIMIT)

  return { filter, page, limit, skip: (page - 1) * limit }
}

/* ================================================================
   GET /api/admin/audit-logs
   Query: page, limit, entityType, action, userId, from, to
   ================================================================ */
router.get('/', asyncHandler(async (req, res) => {
  const { filter, page, limit, skip } = buildAuditLogFilter(req.query as Record<string, unknown>)

  const [logs, total, actions, entityTypes] = await Promise.all([
    // _id breaks the tie: bulk writes share a createdAt to the millisecond, and
    // without a stable secondary sort those rows shuffle between pages.
    AuditLog.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean<AuditLogRow[]>(),
    AuditLog.countDocuments(filter),
    // Vocabulary is read unfiltered: the dropdowns must keep offering every
    // option, not collapse to whatever the current filter already matched.
    AuditLog.distinct('action'),
    AuditLog.distinct('entityType'),
  ])

  // One lookup for the whole page. 'system' is recordAudit's fallback for an
  // unauthenticated writer and is not an ObjectId — passing it to $in throws a
  // CastError that would take the entire request down.
  const userIds = [...new Set(logs.map((l) => l.userId))].filter((id) => isValidObjectId(id))
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } }).select('firstName lastName email').lean()
    : []
  const userMap = new Map(users.map((u) => [u._id.toString(), u]))

  const items = logs.map((log) => {
    const actor = userMap.get(log.userId)
    return {
      id: log._id.toString(),
      userId: log.userId,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      details: log.details ?? null,
      ipAddress: log.ipAddress ?? null,
      createdAt: log.createdAt,
      user: actor
        ? { id: actor._id.toString(), name: `${actor.firstName} ${actor.lastName}`.trim(), email: actor.email }
        : null,
    }
  })

  success(res, {
    items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    actions: [...actions].sort(),
    entityTypes: [...entityTypes].sort(),
  })
}))

export default router

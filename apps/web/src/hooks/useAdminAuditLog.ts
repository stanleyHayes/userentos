import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

/* ================================================================
   Admin audit log — mirrors apps/api/src/routes/adminAuditLogs.ts
   ================================================================ */

/** Resolved from the User collection; null when the writer was 'system' or the account is gone. */
export interface AuditLogActor {
  id: string
  name: string
  email: string
}

export interface AuditLogEntry {
  id: string
  userId: string
  action: string
  entityType: string
  entityId: string
  details: string | null
  ipAddress: string | null
  createdAt: string
  user: AuditLogActor | null
}

export interface AuditLogParams {
  page?: number
  limit?: number
  entityType?: string
  action?: string
  userId?: string
  /** 'YYYY-MM-DD' or a full ISO timestamp. Both bounds are inclusive server-side. */
  from?: string
  to?: string
}

export interface AuditLogResponse {
  items: AuditLogEntry[]
  total: number
  page: number
  limit: number
  totalPages: number
  /** Every action/entityType the collection has ever recorded, unfiltered, for the dropdowns. */
  actions: string[]
  entityTypes: string[]
}

export function useAdminAuditLog(params: AuditLogParams) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    // An empty filter must be absent, not sent blank: the server treats a blank
    // string as no constraint anyway, but sending it churns the query key.
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  const qs = query.toString()

  return useQuery({
    queryKey: ['admin-audit-log', params],
    queryFn: () => api.get<AuditLogResponse>(`/admin/audit-logs${qs ? `?${qs}` : ''}`),
    // Paging through an incident should not blank the table — or the filter
    // dropdowns, which are fed from the same response.
    placeholderData: keepPreviousData,
  })
}

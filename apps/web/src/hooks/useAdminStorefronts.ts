import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// ─────────────────────────────────────────────
// ADMIN STOREFRONT DIRECTORY (spec §14)
// Shapes mirror the "Admin" section of apps/api/src/routes/storefronts.ts.
// The list hands back the raw Storefront documents plus a string `id`, so
// everything below is a field the server actually stores.
// ─────────────────────────────────────────────

export type AdminStorefrontStatus = 'active' | 'suspended' | 'archived'

export interface AdminStorefront {
  id: string
  ownerType: 'user' | 'organization'
  ownerId: string
  slug: string
  name: string
  tagline?: string
  about?: string
  status: AdminStorefrontStatus
  /** Set only after a domain is verified — the API refuses to promote any other. */
  canonicalDomain?: string
  branding?: {
    logoUrl?: string
    coverUrl?: string
    primaryColor?: string
    accentColor?: string
    theme?: string
    hideRentosBranding?: boolean
  }
  contact?: { phone?: string; email?: string; whatsapp?: string; city?: string }
  suspendedReason?: string
  createdAt: string
  updatedAt: string
}

export interface AdminStorefrontList {
  items: AdminStorefront[]
  total: number
}

export interface AdminStorefrontQuery {
  status?: AdminStorefrontStatus | ''
  search?: string
}

/**
 * GET /storefronts?status=&search= — the directory, newest first.
 *
 * Params are normalised before they reach the query key so an unfiltered call
 * from the stat row and an unfiltered call from the table share one request.
 * The server caps the response at 100 rows and reports `total` as the length
 * of that page, so callers should present it as "the newest 100".
 */
export function useAdminStorefronts(params: AdminStorefrontQuery = {}) {
  const status = params.status ?? ''
  const search = params.search?.trim() ?? ''

  const qs = new URLSearchParams()
  if (status) qs.set('status', status)
  if (search) qs.set('search', search)
  const query = qs.toString()

  return useQuery({
    queryKey: ['admin-storefronts', { status, search }],
    queryFn: () => api.get<AdminStorefrontList>(`/storefronts${query ? `?${query}` : ''}`),
  })
}

export interface SuspendStorefrontBody {
  id: string
  /** Required by the server on both paths — it lands in the audit trail. */
  reason: string
  suspend: boolean
}

/** POST /storefronts/:id/suspend — flips the storefront between active and suspended. */
export function useSuspendStorefront() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ id, reason, suspend }: SuspendStorefrontBody) =>
      api.post<{ id: string; status: AdminStorefrontStatus }>(`/storefronts/${id}/suspend`, { reason, suspend }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-storefronts'] })
      // A suspended storefront stops resolving publicly, so the by-slug caches
      // the marketing pages read are stale the moment this succeeds.
      qc.invalidateQueries({ queryKey: ['storefront'] })
      qc.invalidateQueries({ queryKey: ['storefront-me'] })
    },
  })
}

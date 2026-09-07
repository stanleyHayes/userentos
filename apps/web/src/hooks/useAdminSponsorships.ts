import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

/* ================================================================
   Sponsorships (apps/api/src/routes/marketplaceCommerce.ts, spec §9)
   ================================================================ */

export type SponsorshipStatus = 'pending_payment' | 'active' | 'paused' | 'expired' | 'cancelled'
export type SponsorshipPlacement = 'search_top' | 'homepage' | 'category' | 'city'

export interface SponsorshipCampaign {
  id: string
  /** The API returns the raw references — nothing is populated on this route. */
  propertyId: string
  ownerId: string
  productId: string
  placement: string
  startAt: string
  endAt: string
  spend: number
  status: SponsorshipStatus
  pausedReason?: string
  transactionRef?: string
  /** Optional because campaigns written before the counters existed have none. */
  metrics?: { impressions?: number; clicks?: number }
  createdAt: string
  updatedAt: string
}

export interface SponsorshipProduct {
  id: string
  name: string
  description?: string
  placement: SponsorshipPlacement
  durationDays: number
  price: number
  targeting?: { cities?: string[]; regions?: string[]; propertyTypes?: string[] }
  isActive: boolean
  sortOrder: number
}

interface SponsorshipList<T> {
  items: T[]
  total: number
}

/**
 * Platform-wide campaigns. `all=true` is what widens the query beyond the
 * caller's own campaigns, and the server only honours it for admins.
 *
 * There is no status parameter on the route — it returns the newest 100
 * campaigns — so the console filters by status on the client.
 */
export function useAdminSponsorshipCampaigns() {
  return useQuery({
    queryKey: ['admin-sponsorship-campaigns'],
    queryFn: () => api.get<SponsorshipList<SponsorshipCampaign>>('/marketplace/sponsorship/campaigns?all=true'),
  })
}

/** The products currently on sale (the route only returns active ones). */
export function useSponsorshipProducts() {
  return useQuery({
    queryKey: ['sponsorship-products'],
    queryFn: () => api.get<SponsorshipList<SponsorshipProduct>>('/marketplace/sponsorship/products'),
  })
}

export interface PauseSponsorshipBody {
  id: string
  reason: string
  /** True flips the campaign back to active; the reason is still audited. */
  resume?: boolean
}

export function usePauseSponsorship() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason, resume = false }: PauseSponsorshipBody) =>
      api.post<{ id: string; status: SponsorshipStatus }>(
        `/marketplace/sponsorship/campaigns/${id}/pause`,
        { reason, resume },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-sponsorship-campaigns'] }),
  })
}
